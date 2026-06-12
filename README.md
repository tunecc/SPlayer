 ## 关于本 Fork

 本仓库 fork 自上游 [SPlayer-Dev/SPlayer](https://github.com/SPlayer-Dev/SPlayer)，主要针对 **macOS 平台体验**做了适配与修复，并简化了 CI。相比上游的改动如下：

 ### macOS 适配

 - **窗口控制**：移除 macOS 上右上角冗余的 Windows 风格窗口按钮（最小化/最大化/关闭），改用系统原生红绿灯；`titleBarStyle` 改为 `hiddenInset` 使红绿灯常驻显示
- **顶部布局**：导航栏、侧边栏 Logo 与主内容区在无边框模式下顶部留白，避免与红绿灯重叠
 - **Dock 激活**：强化 `showWindow()`，增加窗口销毁守卫与重建兜底，点击 Dock 图标可稳定恢复主窗口
 - **状态栏**：新增「状态栏仅显示图标」选项（外观设置内），可隐藏菜单栏歌曲名，仅保留软件图标，且不影响状态栏歌词

 ### 交互

 - **空格键**：裸空格始终切换播放/暂停，并同步拦截其引起的页面默认滚动

 ### CI

 - 新增 workflow：推送 `dev` 时仅构建 **macOS arm64** 安装包（DMG），并按 `package.json` 版本号发布 Release；同时支持定时同步上游
