import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 初始化
  this._init(options)
}

initMixin(Vue)  // 混入初始化函数实现了_init方法
stateMixin(Vue) // $data,$props,$set,$delete,$watch
eventsMixin(Vue)// $on,$once,$emit,$off
lifecycleMixin(Vue) // _update,$forceUpdate,$destroy
renderMixin(Vue)    // $nextTick,_render 

export default Vue
