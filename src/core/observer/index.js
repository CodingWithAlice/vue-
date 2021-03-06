/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's update computation.
 * shouldObserve作为一个标志位，默认为true，当外部 调用 toggleObserving 方法，可以任意改变标志位的值
 * true：可以观测；false 不可以观测
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  // new Observer 的时候会执行这个构造函数
  constructor (value: any) {
    // 保留传入的value
    this.value = value
    // 实例化一个dep对象
    this.dep = new Dep()
    this.vmCount = 0
    // def方法定义在src/core/util/lang.js
    // 把自身实例添加到数据对象 value 的 __ob__ 属性上
    // def 方法保证了 value 的 __ob__ 属性是一个不可枚举的属性，在下方 this.walk 遍历添加响应式的时候可以避免
    def(value, '__ob__', this)
    // 如果 value 是数组
    if (Array.isArray(value)) {
      // 如果是数组的话，判断是否有原型
      if (hasProto) {
        // 现在一般浏览器都支持原型链，通过 protoAugment 把原型链赋值 value.__proto__ = arrayMethods
        // arrayMethods 定义在 src/core/observer/array.js
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 遍历数组中的每一项，再次调用 observe(items[i])
      this.observeArray(value)
    } else {
      // 如果是普通对象，遍历 value 中的 key ，进行 defineReactive 的调用（添加getter和setter）
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  // 直接把原来的proto原型方法直接覆盖成我们拦截过后的方法
  // 把 target 的原型链指向传入的 src
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  // 遍历 keys
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    // 通过 def 方法，把 target(key) 指向 src(key)
    // def 方法定义在src/core/util/lang.js
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * 核心的目标是，返回一个observer对象的实例
 * 两个参数：value：任意类型；asRootData：是不是根数据
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // initState-->initData-->传入observe(data, true)
  if (!isObject(value) || value instanceof VNode) {
    // 被观测的对象一定要求是一个对象，且不能是个VNode实例
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__ 
    // 如果本身已经有了__ob__属性，就证明已经有了 observer 的实例，就会直接返回__ob__
  } else if (
    // 没有 observer 实例
    // shouldObserve是一个标志位，true能观测；false不能观测
    shouldObserve &&
    // 不是在isServerRendering的时机
    !isServerRendering() &&
    // 传入的被观测的value应该不是一个数组，就是一个对象
    (Array.isArray(value) || isPlainObject(value)) &&
    // 同时要求传入的value是可以扩展属性的
    Object.isExtensible(value) &&
    // 还要确定不是vue实例，vue实例的_isVue为true
    !value._isVue
  ) {
    // 调用 observer 的 Class
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 核心作用：给data中每一个key定义数据劫持
 * 即：定义一个响应式对象，给对象动态添加 getter 和 setter
 * 上一层级调用：defineReactive(obj, keys[i])
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 初始化 Dep 对象的实例，用于依赖收集
  const dep = new Dep()

  // 拿到 obj 的属性描述符
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 递归：如果这个val的值还是一个对象，那么接下来就要开始递归了
  // 这里返回的childOb，是对象情况下的一个observer实例
  let childOb = !shallow && observe(val)
  // 定义数据拦截，即给 obj 的 key 属性添加添加 getter 和 setter
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 依赖收集
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      // 依赖收集
      if (Dep.target) { // 存在正在进行计算的 Watcher -- 当前的渲染Watcher
        dep.depend() // 追加依赖关系，进行依赖收集
        // 如果存在子observer-->只有在 value 是对象 childOb 才不是 undefined
        if (childOb) {
          // ？？？有什么作用--在使用 Vue.set 方法进行响应式处理的时候，收集/订阅渲染 watcher
          childOb.dep.depend()
          // 还要注意如果是数组，还要继续处理
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    // 派发更新 
    set: function reactiveSetter (newVal) {
      // 拿到当前的值，作为旧值，和传入的新值进行比较处理
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 新旧值相同时什么都不做 
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 关键点1，如果用户设置的新值是对象，那么会把 newVal 变成响应式对象
      childOb = !shallow && observe(newVal)
      // 关键点2，通知所有的订阅者，方法定义在 src/core/observer/dep.js
      // computed 触发更新的时候，主要执行的是 notify ，通知的是 computed watcher 做 update
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and triggers change notification if the property doesn't already exist.
 * 接收三个参数 target：数组/对象；key：数组的下标/对象的key；val 任意类型
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    // 如果 target 是 undefined 或者是基础类型的值，触发一个警告
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  /* 可能性1：如果传入的 target 是真实的数组，且 key 是一个合法的索引（大于0的整数）*/
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 首先修改数组的长度，取决于原数组长度/传入修改的数组下标 key 的大小
    target.length = Math.max(target.length, key)
    // 把传入的 val 插入 第 key + 1 个位置
    // 为什么数组只需要 splice 就够了呢？--> 创建 new Observer 时有处理
    target.splice(key, 1, val)
    return val
  }
  /* 可能性2：如果传入的 target 是对象，先判断 key 是不是在 target 中已存在 */
  if (key in target && !(key in Object.prototype)) {
    // 如果已存在，是可以触发对象的 setter 重新渲染的，直接赋值即可
    target[key] = val
    return val
  }
  // 如果传入的对象 target 既不是数组，也不是已定义过的对象属性
  // 先用 ob 获取到对象的 __ob__ 属性（对象已经被观测，是一个响应式对象），里面保存了对象的自身实例
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    /* 可能性3：如果传入的对象 target 是 Vue 实例/ ob 存在 vmCount ，即 ob 是一个 rootData，就触发一个报警 */
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  /* 可能性4：如果传入的对象 target 没有 __ob__ 属性，证明这个对象不是响应式对象 */
  // 普通对象直接赋值
  if (!ob) {
    target[key] = val
    return val
  }
  /* 可能性5：上述条件都不满足的情况下 */
  // 调用 defineReactive 把每个 ob.value 的 key 变成响应式对象（添加 getter 和 setter）
  defineReactive(ob.value, key, val)
  // 手动调用 dep.notify 通知所有的订阅者进行重新渲染；这里的逻辑需要配合上面 defineReactive 中的 childOb.dep.depend()
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
