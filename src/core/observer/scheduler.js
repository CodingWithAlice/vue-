/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

// 该文件中定义了一些全局的变量
const queue: Array<Watcher> = [] // watcher 数组 
const activatedChildren: Array<Component> = [] // 激活的children
let has: { [key: number]: ?true } = {} // hash对象，判断 watcher 不能重复添加
let circular: { [key: number]: number } = {} // 循环更新
let waiting = false // 标志位
let flushing = false // 标志位
let index = 0 // 当前 watcher 的索引

/**
 * Reset the scheduler's state.
 * 这些控制流程状态的一些变量恢复到初始值，把 watcher 队列清空
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush. 对队列做了按照id值从小到大的排序，确保以下几点:
  // 1.组件的更新由父到子；因为父组件的创建过程是先于子的，所以 watcher 的创建也是先父后子， 执行顺序也应该保持先父后子；
  // 2.用户的自定义 watcher 要优先于渲染 watcher 执行；因为用户自定义 watcher 是在渲染 watcher 之前创建的；
  // 3.如果一个组件在父组件的执行期间被销毁，那么它对应的 watcher 执行都可以被跳过；
  queue.sort((a, b) => a.id - b.id) 

  // do not cache length because more watchers might be pushed as we run existing watchers
  // 翻译一下：不要缓存length，因为在 run 存在的 watcher 的时候，可能会添加更多的 watchers
  for (index = 0; index < queue.length; index++) {
    // 遍历 queue ，逐一对 watcher 执行 watcher.run()
    watcher = queue[index]
    if (watcher.before) {
      // 调用了生命周期的钩子beforeUpdate
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    // 该方法定义在 src/core/observer/watcher.js 中
    watcher.run()
    // in dev build, check and stop circular updates.
    // 判断是否存在无限循环更新的情况
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // slice(start,end) 方法可从已有的数组中返回选定的元素-->slice()返回整个数组
  const activatedQueue = activatedChildren.slice()
  // updatedQueue也是不断添加的,queue的副本
  const updatedQueue = queue.slice()

  // 状态恢复
  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  // 该方法用于遍历queue
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 当前watcher为vm._watcher，即渲染watcher，且组件已经mounted，才会执行updated
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      // 调用了生命周期的钩子updated
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it'spushed when the queue is being flushed.
 * 情况：一个 watcher 订阅了多个数据，如果多个数据改变，这里 queueWatcher 保证了同一 watcher 只会被执行一次
 * 作用：不会每次数据改变都触发 watcher 的回调，而是把这些 watcher 先添加到一个队列里，然后在 nextTick 后执行flushSchedulerQueue
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    // 使用 has 对象保证同一个 watcher 只添加一次
    has[id] = true
    if (!flushing) {
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id，if already past its id, it will be run next immediately.
      // 如果是在 run watcher 的过程中添加新的watcher，会进入到这段逻辑
      let i = queue.length - 1
      // 从后往前找，找到第一个待插入 watcher id 比当前队列的 id 大的位置
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      // array.splice(start 起始位置[, deleteCount 删除个数[, item1 待添加内容[, item2[, ...]]]])
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      // 用 waiting 保证 nextTick(flushSchedulerQueue) 只被调用一次
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 在下一个 tick，也就是异步的去执行
      // flushSchedulerQueue 定义在当前页面，用于遍历队列
      nextTick(flushSchedulerQueue)
    }
  }
}
