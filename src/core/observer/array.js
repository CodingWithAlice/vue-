/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  // 这7个方法直接修改数组
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // 逐一遍历上面的7个方法
  // cache original method
  // 拿到数组的原型方法
  const original = arrayProto[method]
  // 添加额外方法--做一个拦截
  def(arrayMethods, method, function mutator (...args) {
    // 执行原先的任务
    const result = original.apply(this, args)
    // 额外的任务，通知更新
    const ob = this.__ob__ // 拿到观察者
    // 以下三个操作，需要额外的响应化处理
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change 
    ob.dep.notify()
    return result
  })
})
