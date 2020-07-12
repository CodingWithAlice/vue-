/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

// 该方法保证了不论加载的是ES模块，还是CommonJS的模块，都能返回正确的export的对象
function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  // 如果返回的是对象，就通过Vue.extend转换成一个构造器
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  // 异步组件-工厂函数：创建空的VNode，最终渲染的是注释节点
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

// 处理了 3 种异步组件的创建⽅式
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {
  // 异步组件-高级异步组件：超过timeout的时候，触发重新渲染，执行到这里，返回对应的errorComp，渲染error组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  // forceRender强制重新渲染时，执行到这里，已经存在了异步组件到构造器，直接返回
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  // 这里的currentRenderingInstance就是定义在render.js中的vm
  const owner = currentRenderingInstance
  // 非第一次执行该异步组件(可能很多地方会调用异步组件)
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    // 只需要往 factory.owners push一下当前vm实例
    factory.owners.push(owner)
  }

  // 异步组件-高级异步组件：还没resolve，但是delay时间已经到了，触发了重新渲染，就会执行到这里，返回loadingComp进行loading组件的渲染
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 第一次执行该异步组件的创建(可能很多地方会调用异步组件)
  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))

    const forceRender = (renderCompleted: boolean) => {
      // 对owners进行了一个遍历，对每一个vm实例都执行forceUpdate，定义在src/core/instance/lifecycle.js
      // forceUpdate相当于是执行vm._update(vm._render(), hydrating)，强制重新渲染一次
      // 执行render的时候，又会执行到createComponent逻辑-->再次执行到当前resolveAsyncComponent
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // once方法是一个辅助的工具函数，定义在src/shared/util.js中，作用是保证传入的方法只执行一次
    // 该方法是factory方法异步加载完成后执行的方法，所以 sync = false
    const resolve = once((res: Object | Class<Component>) => {
      // 这里传入的参数 res = 组件定义的对象，export的值
      // cache resolved
      // ensureCtor返回的是异步组件的构造器，在factory.resolved中做了一次缓存
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    const reject = once(reason => {
      // 异步组件-高级异步组件：发出警告
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      // 异步组件-高级异步组件：如果定义了error组件，就设置标志位，触发重新渲染，返回error组件进行渲染
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })

    // 异步组件-工厂函数：工厂方法就会执行 webpack 的 require 去加载，异步加载
    // 异步组件-Promise：执行箭头函数，执行import方法，返回的res是一个Promise
    // 异步组件-高级异步组件：返回值是定义的组件对象
    const res = factory(resolve, reject)

    // 异步函数-Promise：执行factory后会返回Promise对象，进到这里的逻辑
    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          // 第一次执行的时候，没有定义，就会执行.then函数【异步】，下方代码同步加载完了之后，执行resolve，触发forceRender
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        // 异步组件-高级异步组件：进入到这里的异步调用，先执行完下面的同步代码，异步执行then方法
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          // 异步组件-高级异步组件：如果配置中有error组件就在factory.errorComp上进行扩展
          // ensureCtor方法确保errorComp存储的是一个构造器
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
            // 异步组件-高级异步组件：resolveAsyncComponent的返回值由factory.loading这个标志确定
            factory.loading = true
          } else {
            // 异步组件-高级异步组件：setTimeout异步方法，resolveAsyncComponent方法在第一次执行的时候，返回的还是undefined，触发2次执行
            timerLoading = setTimeout(() => {
              timerLoading = null
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                // 异步组件-高级异步组件：设置标志位，强制重新渲染一次，返回loadingComp，渲染loading组件
                factory.loading = true
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              // 异步组件-高级异步组件：超过最长等待时间，直接调用reject
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously
    // 异步组件-工厂函数：没有这些属性，所以return的是undefined
    // 异步组件-Promise：没有这些属性，所以return的是undefined
    // 异步组件-高级异步组件：第一次渲染的时候，如果定义了delay === 0，就会直接返回loadingComp进行渲染
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}
