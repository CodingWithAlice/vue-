/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   * 参数：传入一个对象
   * 返回：一个构造函数
   * 作用：用原型继承的方式，返回一个子构造器 
   */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    // 这里的this指向的是Vue
    const Super = this
    // SuperId是Vue的cid 
    const SuperId = Super.cid
    // 给入参添加一个_Ctor对象，做一层缓存的优化 
    // 当组件被多次调用时，传入同一个对象，就会返回同一个函数
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 在开发环境对name进行一层合法性校验 
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      // 定义在src/core/util/options.js中，name以英文开头，并且不能是内置HTML标签
      validateComponentName(name)
    }

    // 定义子构造器
    const Sub = function VueComponent (options) {
      // 执行了this._init方法，即Vue._init方法，定义在src/core/instance/init.js中
      // 下面代码进行了原型继承，根据原型链，这里的_init方法就是Vue.prototype方法上的_init方法
      this._init(options)
    }
    // 子构造器的原型-->指向父构造器的原型
    Sub.prototype = Object.create(Super.prototype)
    // 子构造器再指向自身
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 局部注册的时候，先将Vue.options和自定义组件的参数合并到Sub.options
    Sub.options = mergeOptions(
      Super.options, // Vue.options
      extendOptions  // 自定义组件的参数
    )
    // 将super key指向Vue
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 初始化props和computed，属于优化手段
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 在执行 Vue.extend 即创建子组件构造器的过程中，若存在 computed 属性，则调用方法提前定义
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 将Vue的函数赋值给Sub
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // 将Vue的函数赋值给Sub
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    // 自查找所用
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 将Vue的函数赋值给Sub
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 缓存
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  // 遍历 computed 中定义的属性
  for (const key in computed) {
    // 提前调用 defineComputed 方法，将属性定义在组件的原型中
    // 在原型上定义，是为了给多组件进行共享
    defineComputed(Comp.prototype, key, computed[key])
  }
}
