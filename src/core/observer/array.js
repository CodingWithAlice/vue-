/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// 获取到数组到原型
const arrayProto = Array.prototype
// 创建一个新对象
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  // 这7个方法直接修改数组本身
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
  // 先拿到数组的原型方法
  const original = arrayProto[method]
  // 改写/添加额外方法--对 arrayMethods 的 method 做一个改写
  def(arrayMethods, method, function mutator (...args) {
    // 先拿到原先方法，执行，拿到结果
    const result = original.apply(this, args)
    // 保留 __ob__
    const ob = this.__ob__ 
    // 以下操作，把数组原生方法中用于添加数据方法的 args 处理成响应化
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
    // 如果是添加对象，那么响应化处理
    if (inserted) ob.observeArray(inserted)
    // notify change 手动通知数据的变化
    ob.dep.notify()
    return result
  })
})
