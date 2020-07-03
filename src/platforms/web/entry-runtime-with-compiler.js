/* @flow */
// 外部代码用import Vue from 'vue';进行引用时，就是执行这个文件进行初始化
import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

// Vue的来源
import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 先缓存了Vue原型上的$mount方法
const mount = Vue.prototype.$mount
// 缓存后，直接重新定义$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 对el执行了query方法，将字符串el处理成DOM对象，保证el为一个DOM对象
  el = el && query(el)

  /* istanbul ignore if */
  // 对el做了限制，Vue不能直接挂载在body、html上，因为挂载是会覆盖的，这两个DOM节点被覆盖就会出问题
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  // 处理多种类型的渲染模版：el/template/手写render，渲染成render函数
  const options = this.$options
  // resolve template/el and convert to render function
  if (!options.render) {
    // 不是手写render方法时，考虑是写的el/template，优先级：render>template>el
    let template = options.template
    if (template) {
      // 如果是template
      if (typeof template === 'string') {
        // 情况1：template是一个字符串的话
        if (template.charAt(0) === '#') {
          // template是一个选择器的话
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 情况2：template是一个DOM对象的话，直接拿innerHTML
        template = template.innerHTML
      } else {
        // 情况3：tempalte不是字符串也不是DOM对象，那么报个错
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果是没有写template，写了el，getOuterHTML处理一下，返回一个包含elDOM节点的字符串 
      template = getOuterHTML(el)
    }
    // 编译过程
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // 编译的过程就是就是将template转换成render函数（渲染函数）
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 处理完模版调用第19行缓存的mount方法，即定义在原先原型上的mount方法
  // 当render成组件VNode的方法调用Vue.prototype.$mount方法时，由于存在options.render，所以直接进入到调用原先原型上的mount方法
  // 原先原型上的mount方法定义在src/platforms/web/runtime/index.js上，主要调用了mountComponent方法
  // mountComponent方法定义在src/core/instance/lifecycle.js上
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 * 作用：返回el对象的DOM字符串
 */
function getOuterHTML (el: Element): string {
  // 这个对象是否有outerHTML
  if (el.outerHTML) {
    // 有的话直接返回
    return el.outerHTML
  } else {
    // 没有的话，在外面包一层div
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
