/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * Dep 是整个 getter 依赖收集的核心
 * Dep 实际上就是对 Watcher 的一种管理，Watcher 定义在src/core/observer/watcher.js中
 */
export default class Dep {
  // 这里定义了一些属性和方法
  // 尤其需要注意静态属性 target ，这是一个全局唯一 Watcher
  // 由于在同一时间只能有一个全局的 Watcher 被计算，target就是指向了当前正在进行计算的Watcher
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    // 自身属性 subs 是 Watcher 的数组
    this.subs = []
  }

  // 定义添加方法--添加依赖到指定的数组中 
  // addDep方法将渲染Watcher push进this.subs -->Watcher是这个数据的订阅者
  // 即执行render-->访问数据时-->触发数据的getter-->触发addSub-->this.subs作为这个数据变化的订阅者？？？
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }
  // 定义删除方法--删除某个依赖，remove方法是自己定义的
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 维护管理若干watcher
  depend () {
    if (Dep.target) {
      // Dep是一个watcher实例， 这里是建立和watcher实例之间的关系 
      // 如果Dep.target存在，调用 addDep 方法，即 Watcher.addDep(this)
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    // 这里的 slice() 就是获取 this.subs 这个数组里面，所有的依赖
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 遍历所有的 subs ，即遍历所有订阅该数据变化的 watcher 的实例数组
    for (let i = 0, l = subs.length; i < l; i++) {
      // 方法定义在 src/core/observer/watcher.js 
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
// targetStack类似一个存储栈，先进行push，后进行pop
// 主要应用场景在嵌套组件的情况
// 父的mount执行后，父的渲染watcher就会执行到push
// 然后接着执行到子的mount初始化时，子的Watcher先push进数组，用完后pop，保持父的--这个正在计算的watcher仍在数组中
const targetStack = []

export function pushTarget (target: ?Watcher) {
  // Dep.target 的设置过程，把当前实例直接赋值到静态属性
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
