/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   * ASSET_TYPES = ['component','directive','filter']
   */
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        // 在开发环境下对组件名进行校验
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 异步组件中，definition 是一个工厂函数，所以不会进入extend的构造函数转换，而是直接赋值给了 Vue.options.component 
        // definition是一个对象的话，通过this.options._base.extend = Vue.extend将这个对象转换成一个继承于Vue的构造函数
        if (type === 'component' && isPlainObject(definition)) {
          definition.name = definition.name || id
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 把构造器挂载到this.options = Vue.options.component上
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
