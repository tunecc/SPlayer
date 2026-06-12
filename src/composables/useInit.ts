import { mediaSessionManager } from "@/core/player/MediaSessionManager";
import { usePlayerController } from "@/core/player/PlayerController";
import { useDownloadManager } from "@/core/resource/DownloadManager";
import { useDataStore, useSettingStore, useShortcutStore, useStatusStore } from "@/stores";
import { TASKBAR_IPC_CHANNELS } from "@/types/shared";
import { isElectron, isMac } from "@/utils/env";
import { printVersion } from "@/utils/log";
import { openSetting, openUserAgreement } from "@/utils/modal";
import { useEventListener } from "@vueuse/core";
import { debounce } from "lodash-es";
import { onMounted, watch } from "vue";

/** 最终聚焦主窗口的延迟时间（毫秒） */
const FINAL_FOCUS_DELAY_MS = 500;

/**
 * 应用初始化时需要执行的操作
 */
export const useInit = () => {
  // init pinia-data
  const dataStore = useDataStore();
  const statusStore = useStatusStore();
  const settingStore = useSettingStore();
  const shortcutStore = useShortcutStore();

  const player = usePlayerController();
  const downloadManager = useDownloadManager();

  // 事件监听
  initEventListener();

  onMounted(async () => {
    // 检查并执行设置迁移
    settingStore.checkAndMigrate();
    // 打印版本信息
    printVersion();
    // 用户协议
    openUserAgreement();
    // 加载数据
    await dataStore.loadData();
    // 初始化 MediaSession
    mediaSessionManager.init();
    // 初始化播放器
    player.playSong({
      autoPlay: settingStore.autoPlay,
      seek: settingStore.memoryLastSeek ? statusStore.currentTime : 0,
    });
    // 同步播放模式
    player.playModeSyncIpc();
    // 初始化自动关闭定时器
    if (statusStore.autoClose.enable) {
      const { endTime, time } = statusStore.autoClose;
      const now = Date.now();
      if (endTime > now) {
        // 计算真实剩余时间
        const realRemainTime = Math.ceil((endTime - now) / 1000);
        player.startAutoCloseTimer(time, realRemainTime);
      } else {
        // 定时器已过期，重置状态
        statusStore.autoClose.enable = false;
        statusStore.autoClose.remainTime = time * 60;
        statusStore.autoClose.endTime = 0;
      }
    }

    // 监听设置变化以更新 ReplayGain
    watch(
      () => [settingStore.enableReplayGain, settingStore.replayGainMode],
      () => player.applyReplayGain(),
    );

    if (isElectron) {
      // 注册全局快捷键
      shortcutStore.registerAllShortcuts();
      // 初始化下载管理器
      downloadManager.init();
      // 显示窗口
      window.electron.ipcRenderer.send("win-loaded");
      // 同步任务栏歌词状态
      const taskbarConfig = await window.electron.ipcRenderer.invoke(
        TASKBAR_IPC_CHANNELS.GET_OPTION,
      );
      statusStore.showTaskbarLyric =
        taskbarConfig?.enabled ?? statusStore.showTaskbarLyric ?? false;
      window.electron.ipcRenderer.send(
        TASKBAR_IPC_CHANNELS.SET_OPTION,
        { enabled: statusStore.showTaskbarLyric },
        true,
      );
      // 显示桌面歌词
      window.electron.ipcRenderer.send("desktop-lyric:toggle", statusStore.showDesktopLyric);
      // 检查更新
      if (settingStore.checkUpdateOnStart) window.electron.ipcRenderer.send("check-update", false);
      // 如果启用macOS歌词，发送初始数据
      if (isMac && settingStore.macos.statusBarLyric.enabled) {
        window.electron.ipcRenderer.send(TASKBAR_IPC_CHANNELS.REQUEST_DATA);
      }
      // 确保主窗口在最后获得焦点
      if (statusStore.showDesktopLyric) {
        setTimeout(() => {
          window.electron.ipcRenderer.send("win-show-main");
        }, FINAL_FOCUS_DELAY_MS);
      }
    }
  });
};

// 事件监听
const initEventListener = () => {
  // 键盘事件
  useEventListener(window, "keydown", keyDownEvent);
};

// 判断事件是否命中应用内快捷键，返回命中的 key，否则返回 null
// 同步执行，用于决定是否需要 preventDefault（避免误吞 Cmd+W / Cmd+Q / Cmd+, 等系统快捷键）
const matchShortcutKey = (
  event: KeyboardEvent,
  shortcutStore: ReturnType<typeof useShortcutStore>,
): string | null => {
  const key = event.code;
  const isCtrl = event.ctrlKey || event.metaKey;
  const isShift = event.shiftKey;
  const isAlt = event.altKey;
  // 裸空格始终切换播放 / 暂停（仅在 playOrPause 主键仍为 Space 时生效，尊重用户自定义）
  if (key === "Space" && !isCtrl && !isShift && !isAlt) {
    if (shortcutStore.shortcutList.playOrPause.shortcut.split("+").includes("Space")) {
      return "playOrPause";
    }
  }
  // Cmd/Ctrl + , 打开设置（macOS 习惯）
  if (key === "Comma" && isCtrl && !isShift && !isAlt) {
    return "openSetting";
  }
  // 遍历已注册快捷键
  for (const shortcutKey in shortcutStore.shortcutList) {
    const shortcut = shortcutStore.shortcutList[shortcutKey];
    const shortcutParts = shortcut.shortcut.split("+");
    // 标志位
    let match = true;
    // 检查是否包含修饰键
    const hasCmdOrCtrl = shortcutParts.includes("CmdOrCtrl");
    const hasShift = shortcutParts.includes("Shift");
    const hasAlt = shortcutParts.includes("Alt");
    // 检查修饰键匹配
    if (hasCmdOrCtrl && !isCtrl) match = false;
    if (hasShift && !isShift) match = false;
    if (hasAlt && !isAlt) match = false;
    // 如果快捷键定义中没有修饰键，确保没有按下任何修饰键
    if (!hasCmdOrCtrl && !hasShift && !hasAlt) {
      if (isCtrl || isShift || isAlt) match = false;
    }
    // 检查实际按键
    const mainKey = shortcutParts.find(
      (part: string) => part !== "CmdOrCtrl" && part !== "Shift" && part !== "Alt",
    );
    if (mainKey !== key) match = false;
    if (match && shortcutKey) return shortcutKey;
  }
  return null;
};

// 键盘事件入口（同步执行，命中应用内快捷键时才阻止默认行为）
const keyDownEvent = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement;
  // 排除输入框，避免吞掉正常输入
  const extendsDom = ["input", "textarea"];
  if (extendsDom.includes(target.tagName.toLowerCase())) return;
  // 仅当命中应用内快捷键时才处理；否则放行（保留 Cmd+W / Cmd+Q 等系统快捷键）
  const matchedKey = matchShortcutKey(event, useShortcutStore());
  if (!matchedKey) return;
  // 命中后再阻止默认行为（如空格、方向键引起的页面滚动）
  event.preventDefault();
  event.stopPropagation();
  // 忽略长按产生的自动重复事件，仅在首次按下时分发动作
  if (event.repeat) return;
  // 动作分发交给防抖处理
  dispatchShortcut(matchedKey);
};

// 快捷键动作分发（防抖，避免快速连按重复触发）
const dispatchShortcut = debounce((shortcutKey: string) => {
  const player = usePlayerController();
  const statusStore = useStatusStore();
  switch (shortcutKey) {
    case "playOrPause":
      player.playOrPause();
      break;
    case "playPrev":
      player.nextOrPrev("prev");
      break;
    case "playNext":
      player.nextOrPrev("next");
      break;
    case "seekForward":
      player.seekBy(5000);
      break;
    case "seekBackward":
      player.seekBy(-5000);
      break;
    case "volumeUp":
      player.setVolume("up");
      break;
    case "volumeDown":
      player.setVolume("down");
      break;
    case "toggle-desktop-lyric":
      player.toggleDesktopLyric();
      break;
    case "openPlayer":
      // 打开播放界面（任意界面）
      statusStore.showFullPlayer = true;
      break;
    case "closePlayer":
      // 关闭播放界面（仅在播放界面时）
      if (statusStore.showFullPlayer) {
        statusStore.showFullPlayer = false;
      }
      break;
    case "openPlayList":
      // 打开播放列表（任意界面）
      statusStore.playListShow = !statusStore.playListShow;
      break;
    case "openSetting":
      // 打开设置（Cmd/Ctrl + ,）
      openSetting();
      break;
    default:
      break;
  }
}, 100);
