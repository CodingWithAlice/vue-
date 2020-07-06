/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // createComponentInstanceForVnode返回一个子组件的vm实例
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 子组件的$mount方法就是定义在src/platforms/web/entry-runtime-with-compiler.js中的Vue.prototype.$mount方法
      // 子组件调用的时候hydrating参数被传递为false
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

// 默认这几个钩子init、prepatch、insert、destroy
const hooksToMerge = Object.keys(componentVNodeHooks)

// 3个核⼼流程：构造⼦类构造函数，安装组件钩⼦函数和实例化vnode
// 参数分析：Ctor支持多种类型；data是VNode相关Data；context这里指的就是vm实例；children是子VNode
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  // 构造⼦类构造函数
  // context是createElement(vm, a, b, c, d, true)时传入的vm实例
  // 最初初始化Vue的时候，在src/core/global-api/index.js的initGlobalAPI方法中Vue.options._base = Vue
  // 在src/core/instance/init.js的_init方法中将Vue.options扩展到vm.$options上
  /*
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
  */
  // 那么就可以得到基类构造器baseCtor就是Vue
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) {
    // baseCtor.extend方法即Vue.extend，定义在src/core/global-api/extend.js中
    // 如果传入的Ctor是个对象的话，会把Ctor转换成一个新的构造器
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.如果不能正确返回子构造器函数，就会报错
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component 异步组件的处理
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation options处理
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // v-model判断处理
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props 将props处理成propsData
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component 函数组件的处理
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 自定义事件的处理
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn

  // 抽象组件
  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 安装组件钩⼦函数
  installComponentHooks(data)

  // return a placeholder vnode
  // 实例化vnode，需要注意下：组件的 vnode 是没有children的，componentOptions中有一个children
  // new VNode传入的参数tag,data,children,text,elm,context,componentOptions,asyncFactory
  // vue-component-这个是前缀标识
  // { Ctor, propsData, listeners, tag, children }这个对象是componentOptions的值，后面有用到
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

export function createComponentInstanceForVnode (
  vnode: any, // 组件VNode we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode, // 占位符vnode
    parent // 当前vm的实例，也就是子组件的父级vm实例
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // vnode.componentOptions.Ctor就是子类构造函数，就是extend方法中返回的sub构造函数
  // 这里相当于执行了子组件的构造函数，将定义的options传入
  return new vnode.componentOptions.Ctor(options)
}

// 保证组件VNode在patch过程中，一定会执行hooksToMerge中的钩子函数
// 代码中就是把hooksToMerge中的钩子函数赋值给入参
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  // 遍历hooksToMerge：init、prepatch、insert、destroy
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      // 将hooksToMerge中的hooks merge到data.hook
      // 如果钩子函数命名已存在，通过mergeHook合并
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    // 分别将传入的两个函数都执行一遍
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
