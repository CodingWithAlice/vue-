/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)
// 参数对象中 nodeOps：封装了对 “平台DOM”⼀系列操作⽅法
// 参数对象中 modules：定义了⼀些 “平台”模块，它们会在patch过程的不同阶段执行对应的钩⼦函数

export const patch: Function = createPatchFunction({ nodeOps, modules })
