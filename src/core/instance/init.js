/* @flow */
// 初始化函数的实现

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // merge options
    // 合并配置
    if (options && options._isComponent) {
      // 当render结果是组件VNode时，options= {_isComponent: true, _parentVnode: vnode, parent}
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // tag为String，普通vnode
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // 这里返回的直接是Vue.options
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 如果是开发环境
      initProxy(vm)
    } else {
      // 如果是生产环境，_renderProxy就是vm实例本身
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 找到父子关系
    initLifecycle(vm)  // 初始化$parent,$root,$refs,$children
    // 初始化事件中⼼
    initEvents(vm)     // 处理父组件传递的监听器
    // 初始化渲染
    initRender(vm)     // $scopedSlots,$slots,_c(),$createElement()的声明
    // 调用了生命周期的钩子beforeCreate，不能获取到props、data及methods中的方法
    callHook(vm, 'beforeCreate')
    initInjections(vm) // 获取注入数据，resolve injections before data/props
    initState(vm)      // 初始化组件中props、methods、data、computed、watch
    initProvide(vm)    // 提供数据，resolve provide after data/props
    // 调用了生命周期的钩子created，可以访问到data，但不能访问到DOM，因为渲染在下方才调用
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 如果初始化的时候检测到el，实例会自动执行一次$mount挂载vm
    // 挂载的⽬标就是把模板渲染成最终的 DOM
    // render渲染的是一个组件类型的VNode的时候，vm的$options没有el选项
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 该函数只是做了简单一层对象赋值，并不涉及到递归、合并策略等复杂逻辑
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 传入options= {_isComponent: true, _parentVnode: vnode, parent}
  // 这里传入的vm是从extend函数中的Sub子构造函数中调用的this._init(options)
  // 所以vm.constructor就是Sub，vm.$options = Sub.options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode // 占位符vnode，子组件父VNode实例
  opts.parent = options.parent // 子组件的父级vm实例，当前vm的实例
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 如果不是子组件，那么传入的参数是Vue，Vue没有super，相当于这个函数直接返回的是Vue.options
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
