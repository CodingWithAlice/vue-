// 这里就是Vue终极定义的地方
import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

// 是一个构造函数，必须需要用new Vue去实例化
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 初始化
  this._init(options)
}

// 将Vue作为参数传入，作用都是给Vue的prototype上扩展一些方法
initMixin(Vue)  // 混入初始化函数实现了_init方法
stateMixin(Vue) // $data,$props,$set,$delete,$watch
eventsMixin(Vue)// $on,$once,$emit,$off
lifecycleMixin(Vue) // _update,$forceUpdate,$destroy
renderMixin(Vue)    // $nextTick,_render 

export default Vue
