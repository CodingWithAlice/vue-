/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes. 标记静态节点
  markStatic(root)
  // second pass: mark static roots. 标记静态根
  markStaticRoots(root, false)
}

function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  node.static = isStatic(node) // 返回是否为静态节点
  if (node.type === 1) {
    // type 为 1，代表了是普通节点
    // do not make component slot content static. this avoids 不对 component 下面对 slot 做静态节点处理，因为它需要更新
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    // 遍历节点的子节点 -- 递归
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      // 标记
      markStatic(child)
      if (!child.static) {
        // 一旦子节点有非静态节点的情况，整个节点都标记为非静态节点
        node.static = false
      }
    }
    // 存在 v-if 情况，遍历处理 v-if/v-else/v-elseif
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}
/**
 * 
 * @param {*} node 
 * @param {*} isInFor 代表当前节点是否在 v-for 指令中
 */
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 只标记 type 类型为 1 的节点
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children thatare not just static text. 
    // Otherwise the cost of hoisting out will outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      // 相当于当节点有且仅有一个纯文本的子节点时，不能作为 static root
      node.staticRoot = false
    }
    // 对子节点递归执行标记
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  // 对 ast 节点类型进行判断
  if (node.type === 2) { // expression 表达式
    return false
  }
  if (node.type === 3) { // text 纯文本/注释节点
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in 类似 slot component
    isPlatformReservedTag(node.tag) && // 不是类似保留标签 div p
    !isDirectChildOfTemplateFor(node) && // 不是 v-for 下面对字节点
    Object.keys(node).every(isStaticKey) // 满足static key
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    if (node.tag !== 'template') {
      return false
    }
    if (node.for) {
      return true
    }
  }
  return false
}
