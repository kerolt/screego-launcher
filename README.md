# Screego Launcher

[Screego](https://github.com/screego/server) 的桌面启动器（Electron + React + TypeScript），面向**局域网**场景：HTTP 直连、无需证书，自带 screego 内核。

## 功能

- 一键启动 / 停止 `screego serve`
- 图形化选择网卡，自动写入 `SCREEGO_EXTERNAL_IP`
- 应用内查看 / 编辑 / 保存 `screego.config`（主进程校验：`SCREEGO_SECRET` 脱敏回显、仅允许 `SCREEGO_*` 键、保留注释）；也可一键用系统默认编辑器打开
- 启动后展示局域网访问链接（复制 / 浏览器打开）
- 内置 screego 内核；启动时自动检查 GitHub Releases，可一键更新 / 切换 / 回滚内核
- 实时显示 screego 运行日志
- 关闭窗口不退出：Dock 驻留、服务保持运行；Cmd+Q / 菜单 Quit 才会停止内核并退出

## 开发

```bash
npm install
npm run pack:core   # 下载当前平台的 screego 内核到 assets/cores/
npm run dev         # electron-vite 开发模式（渲染层 HMR，主/preload 改动自动重建重启）
```

打包 macOS 应用：

```bash
npm run dist        # 输出 dist/mac-arm64/Screego Launcher.app（未签名）
```

未签名的应用首次打开需在「系统设置 → 隐私与安全性」中允许。启动器会自动去除内核的 quarantine 属性（`xattr -dr`），因此内核无需手动处理。

## 目录结构

```
src/
  main/              Electron 主进程
    index.ts         入口：单实例锁、生命周期（关窗驻留 / before-quit 回收内核）
    ipc.ts           IPC 处理器（频道名统一来自 shared/ipc-channels.ts）
    window.ts        窗口创建 / 隐藏恢复 / 退出标记
    services/        paths / settings / screego-config / core-manager / server-manager
  preload/           contextBridge 白名单桥（CJS 构建，sandbox 兼容）
  renderer/          React 18 界面（函数组件 + hooks）
    index.html       入口（CSP 由 electron.vite.config.ts 按环境注入）
    src/             App + hooks + components + launcher API 封装
    styles/          设计变量与全局样式
  shared/            主/渲染共享：ipc-channels.ts 频道常量、types.ts 类型
electron.vite.config.ts  三端构建配置 + CSP 注入插件
scripts/pack-core.mjs    内核打包脚本
assets/cores/            内置内核（pack-core 生成，打包时经 extraResources 带入 .app）
```

运行时数据（`~/Library/Application Support/Screego Launcher/`）：

- `cores/` 已安装内核 + `current.json` 指向当前内核
- `config/screego.config` screego 配置（启动器通过 `SCREEGO_CONFIG_DIR` 指定，要求 screego ≥ v1.10.4）
- `config/launcher.json` 启动器设置

## 说明

- 仅支持局域网 HTTP 模式；公网使用请自行配置 TLS 或反向代理（编辑 `screego.config` 即可，启动器不会覆盖除 `SCREEGO_EXTERNAL_IP` 外的设置）。
- 内核更新流程：下载 → 解压 → 版本校验 → 原子切换 `current.json` → 清理旧内核；任一步失败自动回滚到之前的内核。
- 已知平台特性：macOS 上 Electron 对带「关闭拦截」窗口的应用处理 SIGTERM 不可靠（系统 quit 路径不受影响）；开发模式下若主进程热重启偶发失效，重新 `npm run dev` 即可。
