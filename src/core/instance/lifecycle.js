/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

// 在Vue.prototype._update中执行该函数
export function setActiveInstance(vm: Component) {
  // 通过prevActiveInstance记录上一个vue实例
  const prevActiveInstance = activeInstance
  // 将正在激活的vm实例用activeInstance进行保存
  // 在继续创建子组件的时候，当前的activeInstance可以作为父组件实例传递
  activeInstance = vm
  return () => {
    // 执行完patch之后，执行这个方法可以将activeInstance恢复到上一个activeInstance
    activeInstance = prevActiveInstance
  }
}

// 建立父子组件的关系
// 这里的vm代表的是传入的子组件，parent（从上一个函数中通过参数activeInstance传递进函数）代表父组件
export function initLifecycle (vm: Component) {
  // 获取到输入选项，传入的vm是子组件的实例
  const options = vm.$options

  // locate first non-abstract parent
  // options.parent就是在src/core/vdom/create-component.js传入的当前页面之前_update时保存的activeInstance
  // parent是父组件的实例
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 把当前组件的实例放到父组件的children中
    parent.$children.push(vm)
  }

  // 把当前子组件的$parent指向传入的parent父组件实例
  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // _update的作⽤是把 VNode 渲染成真实的 DOM
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    const prevEl = vm.$el
    // 在组件更新的时候，vm._vnode 中保存了上一个生成的 VNode
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
    // 将之前render生成的渲染vnode赋值给_vnode
    // 这里注意 $vnode中保存的是占位符vnode，即父级vnode
    vm._vnode = vnode
    // _update被调⽤的时机有 2 个，⼀个是⾸次渲染，⼀个是数据更新的时候
    // _update的核⼼就是调⽤ vm.__patch__ ⽅法
    // __patch__方法在不同平台定义不同：weex、web
    if (!prevVnode) {
      // initial render 首次渲染的时候
      // 参数含义：
      // vm.$el是在mountComponent函数做的缓存，是真实的DOM，oldVnode表⽰旧的VNode节点，它也可以不存在或者是⼀个DOM对象 
      // vnode表⽰执⾏ _render 后返回的 VNode 的节点
      // hydrating表⽰是否是服务端渲染
      // removeOnly是给 transition-group ⽤的
      // 子组件的参数vm.$el是不存在的，undefined；返回的结果是一个DOM
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates 数据更新
      // __patch__方法定义在 src/core/vdom/patch.js中
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  // 异步组件-工厂函数：异步加载完工厂函数后会执行resolve方法进入到此函数
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      // 调用渲染watcher的update，最终会执行到vm._update(vm._render(), hydrating)，相当于强制重新渲染一次
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    // 调用了生命周期的钩子beforeDestroy，该销毁方法一开始就执行了这个钩子函数
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm) // 从parent的$children删掉自身
    }
    // teardown watchers 删除watcher
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    // 触发子组件的销毁钩子函数，递归
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    // 调用了生命周期的钩子destroyed
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

// 主要任务：完成整个渲染工作
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 缓存传入的el 
  vm.$el = el
  if (!vm.$options.render) {
    // 如果没有render函数，且template没有正确转换成render函数，则定义一个空VNODE
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      // 如果使用的是runtime only的版本，但是又不写render函数/写了template模版，就会出发警告
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 调用了生命周期的钩子beforeMount，在vm._render()前，即挂载前执行
  callHook(vm, 'beforeMount')

  // 定义了一个updateComponent方法，最终就是调用vm._render()、vm._update()方法
  // 这个方法被下方的new Watch创建实例的时候作为回调函数使用
  let updateComponent
  /* istanbul ignore if */
  // mark是一些性能埋点的东西
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      // vm._render()生成VNODE
      // vm._update更新DOM
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 渲染Watcher：实例化渲染一个Watcher，updateComponent作为回调函数
  // new Watcher的两个作用：1、初始化时，执行回调函数；2、当vm中监测的数据发生变化时，执行回调函数；
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted && !vm._isDestroyed) { // 在组件已经mounted之后，才会去调用这个钩子函数
        // 调用了生命周期的钩子beforeUpdate
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
// 参数：vm-vue的实例，expOrFun-函数，cb-空函数，options-配置，boolean 
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // vm.$vnode表⽰Vue实例的⽗VNode，所以它为Null则表⽰当前是根Vue的实例
  // vm.$vnode 如果为 null ，则表明这不是⼀次组件的初始化过程，⽽是我们通过外部 new Vue 初始化过程
  if (vm.$vnode == null) {
    // 如果是根结点时，设置vm._isMounted为true，表示这个实例已经挂载了
    vm._isMounted = true
    // 调用了生命周期的钩子mounted，在执行完vm._update把VNode patch到真实DOM后，执行mounted
    callHook(vm, 'mounted')
  }
  return vm
}

/**
 * 
 * @param {*} vm 
 * @param {*} propsData 
 * @param {*} listeners 
 * @param {*} parentVnode 
 * @param {*} renderChildren 
 * 作用：在子组件调用子组件时，会传一些 props、事件等，在组件更新的时候，对子组件的这些也要更新
 * 实现：
 */
export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// 生命周期的函数都是调用callHook方法
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 根据传入的hook，拿到对应的回调函数数组，vm.$options是合并配置的结果
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  // 然后遍历执行，执行时把vm作为上下文
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      // 定义在src/core/util/error.js中，这里等价于执行handlers[i].call(vm)
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
