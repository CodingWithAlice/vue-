// 先从配置文件读取配置builds，再用命令行参数对配置文件进行过滤，构建出不同用途的Vue.js到dist目录下
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const rollup = require('rollup')
const terser = require('terser')

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist')
}
let builds = require('./config').getAllBuilds()

// filter builds via command line arg
// 这里方法的作用是：过滤掉不需要编译的
// process.argv指的package.json中的指令 -- 后面的参数
if (process.argv[2]) {
  // 如果有参数的话
  const filters = process.argv[2].split(',')
  // 就把不需要打包的过滤掉
  builds = builds.filter(b => {
    return filters.some(f => b.output.file.indexOf(f) > -1 || b._name.indexOf(f) > -1)
  })
} else {
  // 如果没有参数的话，就把weex过滤掉
  // filter out weex builds by default 
  builds = builds.filter(b => {
    return b.output.file.indexOf('weex') === -1
  })
}

// 执行编译方法
build(builds)

function build (builds) {
  // 计数器
  let built = 0
  const total = builds.length
  // 定义并执行next方法，调用执行buildEntry
  const next = () => {
    buildEntry(builds[built]).then(() => {
      built++
      if (built < total) {
        next()
      }
    }).catch(logError)
  }

  next()
}

function buildEntry (config) {
  const output = config.output
  const { file, banner } = output
  // 以min.js prod.js结尾
  const isProd = /(min|prod)\.js$/.test(file)
  return rollup.rollup(config)
    .then(
        // rollup方法编译完之后，拿到bundle后利用generate产生output
        bundle => bundle.generate(output)
    )
    .then(({ output: [{ code }] }) => {
      // 可能会对输出的output做一点修改
      // 判断是否需要压缩 
      if (isProd) {
        const minified = (banner ? banner + '\n' : '') + terser.minify(code, {
          toplevel: true,
          output: {
            ascii_only: true
          },
          compress: {
            pure_funcs: ['makeMap']
          }
        }).code
        // 最终调用fs.write方法生成到dist目录下
        return write(file, minified, true)
      } else {
        return write(file, code)
      }
    })
}

function write (dest, code, zip) {
  return new Promise((resolve, reject) => {
    function report (extra) {
      // 生成过程中可以打印一些信息
      console.log(blue(path.relative(process.cwd(), dest)) + ' ' + getSize(code) + (extra || ''))
      resolve()
    }

    fs.writeFile(dest, code, err => {
      if (err) return reject(err)
      if (zip) {
        zlib.gzip(code, (err, zipped) => {
          if (err) return reject(err)
          report(' (gzipped: ' + getSize(zipped) + ')')
        })
      } else {
        report()
      }
    })
  })
}

function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

function logError (e) {
  console.log(e)
}

function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}
