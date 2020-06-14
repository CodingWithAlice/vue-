/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // 定义添加方法--添加依赖到指定的数组中 
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
      // 如果Dep.target存在，即保存了依赖，就将它push进subs中
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    // 这里的slice()就是获取this.subs这个数组里面，所有的依赖
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
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
