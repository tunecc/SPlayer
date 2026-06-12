<!-- 侧边栏 -->
<template>
  <div class="sider-all">
    <!-- Logo -->
    <div
      :class="['logo', { collapsed: statusStore.menuCollapsed, 'mac-inset': isMac && useBorderless }]"
      @click="router.push('/')"
    >
      <Logo />
      <n-text>SPlayer</n-text>
    </div>
    <n-scrollbar
      :style="{
        maxHeight: `calc(100vh - ${
          (musicStore.isHasPlayer && statusStore.showPlayBar ? 150 : 70) +
          (isMac && useBorderless ? 22 : 0)
        }px)`,
      }"
    >
      <Menu />
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useStatusStore, useMusicStore } from "@/stores";
import { isElectron, isMac } from "@/utils/env";

const router = useRouter();
const musicStore = useMusicStore();
const statusStore = useStatusStore();

// 是否启用无边框窗口（用于 macOS 红绿灯留白）
const useBorderless = ref(true);

onMounted(() => {
  if (isElectron) {
    window.api.store.get("window").then((windowConfig) => {
      useBorderless.value = windowConfig?.useBorderless ?? true;
    });
  }
});
</script>

<style lang="scss" scoped>
.sider-all {
  display: flex;
  flex-direction: column;
  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 70px;
    padding: 0 1rem;
    transition: transform 0.3s;
    cursor: pointer;
    // macOS 无边框：顶部留白，避免 Logo 与红绿灯重叠
    &.mac-inset {
      height: 92px;
      padding-top: 22px;
    }
    .n-text {
      width: 90px;
      font-size: 22px;
      font-family: "logo";
      margin-left: 8px;
      margin-top: 2px;
      line-height: 40px;
      overflow: hidden;
      transition:
        width 0.3s,
        opacity 0.3s,
        margin 0.3s;
    }
    &.collapsed {
      .n-text {
        width: 0;
        opacity: 0;
        margin-left: 0;
      }
    }
    &:hover {
      transform: scale(1.05);
    }
    &:active {
      transform: scale(1);
    }
  }
}
</style>
