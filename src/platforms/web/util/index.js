/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
export function query (el: string | Element): Element {
  if (typeof el === 'string') {
    // 如果el是个字符串
    const selected = document.querySelector(el)
    if (!selected) {
      // 如果找不到这个类型，就先报个错，然后返回一个空div的DOM对象
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      return document.createElement('div')
    }
    return selected
  } else {
    // 如果不是字符串，那么就证明el已经是一个DOM对象
    return el
  }
}
