/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

// 定义了一个共享属性的定义
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}
// 自定义了一个proxy方法，通过sharedPropertyDefinition对象定义了一个get和set方法
// proxy(vm, `_data`, key)
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  // 通过Object.defineProperty这个方法，将target（传入的vm）的key进行get和set方法的代理
  // 当我们访问this.message的时候，就是访问this._data.message
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 是否对props、methods、data、computed、watch进行了定义，有的话就进行初始化
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  // data处理，响应化处理
  if (opts.data) {
    initData(vm) // 作用：判断重复key名，调用observe方法
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  // Computed 初始化逻辑
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 重点
function initProps (vm: Component, propsOptions: Object) {
  // 拿到options中的props的定义
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    // 该方法定义在 src/core/observer 中，作为改变是否能够观测的标志位的方法
    // 这里将标志位设置为fasle，如果存在vm.$parent，即不是根实例上的数据，就不进行观测
    toggleObserving(false)
  }
  // 遍历propsOptions进行校验（自定义的props配置）
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 重点方法：遍历时，调⽤ defineReactive ⽅法把每个 props 对应的 key 变成响应式的
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 重点
function initData (vm: Component) {
  // 从定义的 vm.$options 中获取data
  let data = vm.$options.data
  // 对vm._data进行了赋值
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 如果data不是一个函数的话，开发环境下会报一个警报；
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 这里拿到data、props、methods里面的key，进行遍历避免与其他重复
  // 原因：三者最后都会以 key 挂载到 vm/this 的实例上
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 使用 proxy 方法进行代理，将 data 中的内容 key 代理到 vm 实例上
      proxy(vm, `_data`, key)
    }
  }
  // observe 方法：数据遍历的开始，核心作用是 判断数据对象的类型，做响应的处理
  // 定义在 src/core/observer 中
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 创建两个空对象，对象是引用的，后续代码先对 watchers  进行了赋值，实际上 _computedWatchers 就是 watchers
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR 是不是服务器渲染 - 这里不看
  const isSSR = isServerRendering()

  // 遍历定义的计算属性
  for (const key in computed) {
    // 拿到计算属性的值：函数/对象
    const userDef = computed[key]
    // 获取当前计算属性的 getter -- 一般写为函数，如果不是函数，是对象的话，要求对象有 get 属性定义一个函数
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      // 没有 getter 就报警
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 为每一个 getter 创建一个 watcher
    // 在非 SSR 的情况下，实例化 Watcher ，对应保存着在 watchers[key] 中
    // 和创建渲染 watcher 有什么不同？--查看src/core/observer/watcher.js，只是实例化了对应的 watcher ，并不会执行
    if (!isSSR) {
      // computed 其实是通过 Watcher 来实现的
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        // 回调函数是一个 noop
        noop,
        // watcher 配置 -- { lazy: true }
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the component prototype. 
    // We only need to define computed properties defined at instantiation here.
    if (!(key in vm)) {
      // 如果 key 不在 vm 中
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果 key 已存在于 props/data，就证明重名了
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any, // vm
  key: string,
  userDef: Object | Function
) {
  // shouldCache 在浏览器环境下是 true ，证明需要缓存
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    // 如果 userDef (computed 中定义的计算属性值)是个函数的话
    // 定义了共享变量的 get 方法，即访问 vm.key -- computed 的值时执行的 getter 方法
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 如果不是函数，即 userDef 是一个对象的话
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 这里把上面定义的 get 方法响应化处理
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 调用该函数的返回函数作为计算属性对应的 getter 函数
function createComputedGetter (key) {
  return function computedGetter () {
    // 通过上面代码缓存的 watchers 进行获取对应的 watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // watcher.dirty 初始的时候为 true ，但是执行过一次 evaluate 后会置 false
      // 只有在 computed 依赖值发生改变触发 computed watcher 的 update 的时候，dirty 的值会重新置为 true
      if (watcher.dirty) {
        // 执行到 evaluate 才会执行到 new Watcher 中的 get 方法
        watcher.evaluate()
      }
      if (Dep.target) {
        // 存在正在计算的 watcher ，调用 watcher.depend
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 接下来是 侦听属性 的代码逻辑
function initWatch (vm: Component, watch: Object) {
  // 遍历传入的watch
  for (const key in watch) {
    // 拿到每一个 watch 作为 handler，handler可以是一个对象/函数/数组
    const handler = watch[key]
    // 如果 handler 是数组就进行遍历
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      // 最终都是调用该方法
      createWatcher(vm, key, handler)
    }
  }
}

/**
 * 
 * @param {*} vm 
 * @param {*} expOrFn   // 可以观测一个 字符串，也可以观测一个 函数
 * @param {*} handler   // 回调函数
 * @param {*} options 
 * 函数作用：数据类型规范化，并调用 $watch -> $watch 才是真正 new Watcher 的
 * 返回的 vm.$watch(expOrFn, handler, options)中
 * handler 为回调函数，可以 watch 传入的 expOrFn 函数
 */
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 如果是对象，则取对象的属性值，需要保证 handler 是一个函数
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 如果是 字符串，直接取实例上的方法
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 因为直接挂载在原型，所以用户可以直接 this.$watch 去监听一个数据的变化/在组件上面编写 watch 属性
  /**
   * 
   * @param {*} expOrFn 
   * @param {*} cb 也有可能是对象，所以还需要校验类型
   * @param {*} options 
   */
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // options = {user:true} userWacther 的标识
    options.user = true
    // 跳转到 src/core/observer/watcher.js 去看下实例化 watcher 的过程
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果配置了 immediate 参数，就直接立即执行这个方法一次
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    // 返回的函数，在执行的时候会把 watcher 销毁
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
