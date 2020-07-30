/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 * Watcher 是一个 Class，在它的构造函数中，定义了一些和 Dep 相关的属性
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  // 定义了一些和 Dep 相关的属性
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  // computed watcher 实例化 new Watcher 的时候执行构造函数 
  // computed watcher 传入参数：new Watcher( vm, getter || noop , noop , { lazy: true } )
  constructor (
    // vue的实例
    vm: Component,
    // 用户可以会传一个更新函数
    expOrFn: string | Function,
    // 回调函数
    cb: Function,
    // 配置
    options?: ?Object,
    // bollean
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // computed watcher 不是渲染 watcher，不会赋值
    if (isRenderWatcher) {
      // 如果是渲染watcher，把当前的watcher实例赋值给vm._watcher
      // vm._watcher存储的是渲染watcher
      vm._watcher = this
    }
    // 把computed watcher push 到 vm._watchers 中
    vm._watchers.push(this) 
    // options-配置 
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      // computed watcher 执行时，注意这里的 lazy 为 true
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      // 保存了before函数
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    // computed watcher 执行时，注意这里 dirty 为 true
    this.dirty = this.lazy // for lazy watchers
    this.deps = [] // 表示 Watcher 实例持有的 Dep 实例的数组
    this.newDeps = [] // 表示 Watcher 实例持有的 Dep 实例的数组
    this.depIds = new Set() // 代表 this.deps 的 id Set
    this.newDepIds = new Set() //代表 this.newDeps 的 id Set
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter，如果传入的第二个参数是一个函数，
    // 渲染 Watcher 下，就是updateComponent
    // computed watcher 下，就是 userDef === 对应于 computed 中定义的函数 
    if (typeof expOrFn === 'function') {
      // 如果expOrFn是函数的话，直接赋值给Watcher的getter
      this.getter = expOrFn
    } else {
      // 如果是个表达式的话，要转换成为一个函数
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 如果是在渲染 watcher 情况下，就会执行get()方法求值，用于依赖收集
    // 如果是在 computed watcher 情况下，给 value 赋值 undefined ，不会再执行 get 方法进行依赖收集
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 用于依赖收集
   */
  get () {
    // 设置Dep.target，定义在src/core/observer/dep.js中，保存当前正在计算的Watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 触发依赖收集，这个getter就是上面传入的expOrFun函数，就是 updateComponent
      // 如果是 computed watcher 执行， getter 就是自定义的 computed 方法，求值的过程中，会触发依赖收集，computed 依赖的值发生变化的话，就会触发 computed watcher 的 update
      // updateComponent-->执行vm._render()-->执行vnode = render.call()就会访问到定义在模版中的数据-->就会访问到这些数据的getter
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      // 将watcher pop出targetStack数组，恢复上一次正在进行计算的watcher
      popTarget()
      // 为什么还需要cleanupDeps？-- 避免页面中数据已经不再使用了，但是代码修改还会触发重新渲染，浪费性能
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 判断newDepIds是否有该id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id) // 添加id
      this.newDeps.push(dep) // push进数组
      // 如果depIds也没有的话
      if (!this.depIds.has(id)) {
        // 定义在src/core/observer/dep.js
        // 将当前渲染Watcher push进this.subs
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清除一些依赖收集
   * 为什么？--数据改变，每次触发重新渲染-->重新render-->重新addDep
   * 作用：把所有的 dep 做一次比对，只要新的一轮渲染中，没有对应订阅的 watcher ，就把旧的 watcher订阅 移除了，避免页面中数据已经不再使用了，但是代码修改还会触发重新渲染，浪费性能
   *  newDepIds 和 newDeps 每次都会在addDep新增，上面的判断只能保证不会重复添加旧的
   */
  cleanupDeps () {
    // 把 deps 清空
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 交换 depIds 和 newDepIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 清空 newDepIds
    this.newDepIds.clear()
    // 交换 deps 和 newDeps
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    // 清空 newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    // 对于 Watcher 的不同状态，会执行不同的逻辑
    if (this.lazy) {
      // computed watcher 的依赖发生变化时
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 在一般组件数据更新的场景，会走到这里
      // 方法定义在src/core/observer/scheduler.js
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 触发组件重新渲染的原因：
      // 先通过 get 方法获得当前的值（新值）-->会触发 value = this.getter.call(vm, vm) --> 即回调函数 updareComponent
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even when the value is the same, because the value may have mutated.
        isObject(value) ||
        this.deep
      ) {
        // 如果新旧值不等/新值是对象类型/deep模式
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          // 执行回调函数，传入新/旧两个值
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    // computed watcher 执行到 evaluate 方法才会执行 get 方法，才会触发 getter
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   * this.deps 表示 Watcher 实例持有的 Dep 实例的数组
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      // deps.depend -> Dep.target.addDep(this) -> dep.addSub(this) -> this.subs.push(sub) -> 后续变化的时候通知的是 subs 这个数组
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
