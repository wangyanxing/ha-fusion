# 定制版 ha-fusion —— 树莓派 HAOS 部署与更新指南

本目录（`hass-addon/`）是把**我自己 fork 的定制版 ha-fusion** 作为「本地加载项（Local add-on）」安装到 **Home Assistant OS（树莓派）** 所需的全部文件。

- fork 仓库：<https://github.com/wangyanxing/ha-fusion>
- 加载项 slug：`ha_fusion_custom`（和官方 `ha_fusion` 独立，可并存）
- 访问方式：Ingress（免配 `HASS_URL`，自动走 HA 鉴权）

---

## 目录

- [1. 原理说明](#1-原理说明)
- [2. 本目录文件清单](#2-本目录文件清单)
- [3. 首次部署（一步步）](#3-首次部署一步步)
- [4. 从旧版迁移配置](#4-从旧版迁移配置)
- [5. 以后如何更新代码](#5-以后如何更新代码)
- [6. 常见问题排查](#6-常见问题排查)
- [7. 名词对照表](#7-名词对照表)

---

## 1. 原理说明

树莓派上的 Home Assistant OS（HAOS）是封闭系统，**不能直接 `docker build` / `docker run`**，只能通过「加载项（add-on）」机制安装第三方应用。

一个「本地加载项」本质上就是放在 HAOS 的 `/addons/` 目录里的一个文件夹，里面有 `config.yaml` + `Dockerfile`。HA 的 Supervisor 会读取它、**在树莓派本地构建 Docker 镜像**并运行。

本目录的 `Dockerfile` 做的事：
1. `git clone` 我的 fork 仓库（`wangyanxing/ha-fusion`）的 `main` 分支
2. `npm install && npm run build` 构建 SvelteKit 应用
3. 用 HA 官方 Alpine 基础镜像打包，`run.sh` 启动 `server.js`

所以：**代码来源是 GitHub 上我 fork 的最新 `main` 分支，不是本地磁盘。** 每次改完代码必须先 `git push`，加载项重建时才能拉到新代码。

---

## 2. 本目录文件清单

| 文件 | 作用 |
| --- | --- |
| `config.yaml` | 加载项元数据：名称、slug、架构、Ingress、图标等 |
| `build.yaml` | 各 CPU 架构对应的基础镜像（树莓派用 `aarch64` / `armv7`） |
| `Dockerfile` | 构建逻辑：`git clone` fork → `npm build` → 打包 |
| `run.sh` | 启动脚本，用 bashio 注入端口后运行 `node server.js` |
| `README.md` | 本文件 |

---

## 3. 首次部署（一步步）

### 步骤 0：确认代码已推送到 GitHub

加载项是从 GitHub `git clone` 构建的，**本地未 push 的改动不会生效**。

在电脑上：

```bash
cd /path/to/ha-fusion
git status        # 确认没有未提交改动
git push          # 推送到 origin/main
```

### 步骤 1：装一个能访问系统目录的工具

需要能往 HAOS 的 `/addons/` 目录写文件。二选一：

- **方案 A（推荐，命令行）**：加载项商店安装 **「Advanced SSH & Web Terminal」**
  - 安装后进它的 **配置（Configuration）** 页，把 **Protection mode（保护模式）关闭**，否则访问不了系统目录
  - 重启该加载项，然后用它的 Web 终端 / SSH 登录
- **方案 B（图形化拖文件）**：加载项商店安装 **「Samba share」**，在电脑上通过网络共享把文件拖进 `addons` 文件夹

> 「加载项商店」位置：HA 左下角 **设置 → 加载项 → 右下角「加载项商店」**。

### 步骤 2：把本目录 4 个文件放到 `/addons/ha_fusion_custom/`

**用 SSH 终端一条命令拉取**（最省事，因为文件已 push 到 GitHub）：

```bash
mkdir -p /addons/ha_fusion_custom && cd /addons/ha_fusion_custom
for f in config.yaml build.yaml Dockerfile run.sh; do
  wget -O "$f" "https://raw.githubusercontent.com/wangyanxing/ha-fusion/main/hass-addon/$f"
done
ls -l   # 应能看到 4 个文件
```

> 或用 Samba：在电脑上打开 `\\<树莓派IP>\addons`（Windows）/ `smb://<树莓派IP>/addons`（Mac），
> 新建文件夹 `ha_fusion_custom`，把本目录 4 个文件拖进去。

### 步骤 3：让 HA 发现这个本地加载项

1. HA → **设置 → 加载项 → 加载项商店**
2. 右上角 **三点菜单 ⋮ → 检查更新（Check for updates）**
3. 刷新页面后往下拉，出现 **「Local add-ons / 本地加载项」** 分类，里面有 **Fusion (Custom)**

> 如果没出现：检查文件路径是否为 `/addons/ha_fusion_custom/config.yaml`（文件夹名不能错），且 `config.yaml` 内容完整。

### 步骤 4：安装并启动

1. 点开 **Fusion (Custom)** → **安装（Install）**
   - 首次会在树莓派上 `git clone` + `npm build`，**较慢（几分钟到十几分钟）**，属正常，耐心等
2. 安装完成后：
   - 打开 **「Show in sidebar / 在侧边栏显示」** 开关
   - 点 **启动（Start）**
   - 建议也打开 **「Start on boot / 开机启动」** 和 **「Watchdog」**
3. 点侧边栏里新出现的图标即可打开定制版仪表盘（走 Ingress，无需配 `HASS_URL`）

---

## 4. 从旧版迁移配置

定制版 slug 是 `ha_fusion_custom`，和旧的官方版 `ha_fusion` **数据目录独立**，所以 `dashboard.yaml`、`configuration.yaml`、自定义 CSS **不会自动带过来**，需手动拷贝。

在 SSH 终端（Protection mode 已关闭）：

```bash
# 先找到两个加载项的数据目录确切名字
ls /mnt/data/supervisor/addons/data/

# 假设旧版目录含 ha_fusion、新版含 ha_fusion_custom，拷贝配置：
OLD=$(ls -d /mnt/data/supervisor/addons/data/*ha_fusion | grep -v custom | head -1)
NEW=$(ls -d /mnt/data/supervisor/addons/data/*ha_fusion_custom | head -1)
cp "$OLD/dashboard.yaml"     "$NEW/" 2>/dev/null
cp "$OLD/configuration.yaml" "$NEW/" 2>/dev/null
# 有自定义 CSS 的话一并拷贝
cp "$OLD"/*.css "$NEW/" 2>/dev/null
```

拷贝后在加载项页面 **重启（Restart）** Fusion (Custom)，刷新浏览器即可看到原有仪表盘。

**确认新版一切正常后，再删除旧版**（旧的官方 add-on 页面 → 卸载 / Uninstall）。不着急删，两者可并存对比。

---

## 5. 以后如何更新代码

日常改代码 → 上线，只有两步：

```bash
# 1. 电脑上：改完代码、验证、推送
git push
```

```
2. HA 加载项页面：Fusion (Custom) → 三点菜单 ⋮ → 重建（Rebuild）
```

**Rebuild** 会重新 `git clone` 最新 `main` 并重新构建。构建完成会自动用新镜像重启。

> 注意：
> - 不 push 就 Rebuild = 拉到的还是旧代码，白重建。
> - 只是重启（Restart）**不会**拉新代码，必须用 **Rebuild**。
> - 改了 `hass-addon/` 里的文件（如 `config.yaml`、`Dockerfile`）后，需要重新执行 [步骤 2](#步骤-2把本目录-4-个文件放到-addonsha_fusion_custom) 把文件同步到 `/addons/ha_fusion_custom/`，再 Reload / Rebuild。

### Rebuild 后看不到新代码？（Docker 层缓存）

**现象**：push 了新代码、Rebuild 也成功，但功能没变化。

**原因**：`Dockerfile` 里 `git clone` 那一行是固定字符串，Docker 会**复用缓存层**、跳过重新 clone，于是拉的还是上次构建时的旧代码。

**已内置的修复**：本仓库 `hass-addon/Dockerfile` 在 clone 前加了一行
`ADD https://api.github.com/repos/.../commits/main /tmp/commit.json`。
GitHub 每次有新提交，这个响应里的 commit SHA 就会变，从而让下面的 clone 层缓存失效，Rebuild 便会真正拉取最新代码。

> 前提：更新了 `Dockerfile` 后，记得把它重新同步到 `/addons/ha_fusion_custom/Dockerfile`（见步骤 2），再 Rebuild。

**应急手段（不改文件，强制无缓存构建）**：SSH 终端（Protection mode 已关）执行
```bash
docker build --no-cache --pull \
  --build-arg BUILD_FROM=ghcr.io/hassio-addons/base:17.1.4 \
  -t local/ha_fusion_custom \
  /addons/ha_fusion_custom
```
构建完在加载项页面点 **Restart**。

---

## 6. 常见问题排查

**加载项商店里看不到 Local add-ons**
- 文件路径必须是 `/addons/ha_fusion_custom/config.yaml`
- 执行了「三点菜单 → 检查更新」后再刷新页面
- `config.yaml` 语法错误也会导致不显示，检查缩进

**安装 / 构建失败**
- 看加载项的 **「日志（Log）」** 标签页
- 常见原因：树莓派网络访问 GitHub 失败（clone 超时）→ 重试，或检查网络/DNS
- 内存不足导致 `npm build` 被杀 → 树莓派内存较小时构建会吃力，可关掉其它占内存的加载项后重试

**打开页面空白 / 连不上 HA**
- 走 Ingress 时不需要 `HASS_URL`；确认是从**侧边栏图标**打开的，而不是直接访问端口
- 看日志是否有 `Starting Fusion (Custom)...` 和 `ADDON: true`

**改了代码但页面没变化**
- 确认 `git push` 成功（`git log origin/main` 能看到最新提交）
- 用了 **Rebuild** 而不是 Restart
- 浏览器强制刷新（Cmd/Ctrl + Shift + R）清缓存

**想临时暴露端口（用查询字符串 `?view=` / `?menu=false`）**
- Ingress 读不到查询字符串。需在 `config.yaml` 把 `ports` 的 `8099/tcp: null` 改成 `8099/tcp: 8099`，同步文件后 Rebuild，再用 `http://<树莓派IP>:8099/?view=Bedroom` 访问。

---

## 7. 名词对照表

| 中文界面 | 英文界面 | 说明 |
| --- | --- | --- |
| 设置 | Settings | HA 左下角 |
| 加载项 | Add-ons | 扩展功能管理 |
| 加载项商店 | Add-on Store | 安装 add-on 的入口（加载项页右下角） |
| 检查更新 | Check for updates | 三点菜单里，用于刷新本地 add-on 列表 |
| 本地加载项 | Local add-ons | 放在 `/addons/` 的自建 add-on 分类 |
| 安装 / 启动 / 重启 | Install / Start / Restart | — |
| 重建 | Rebuild | 重新 clone+build，更新代码用这个 |
| 在侧边栏显示 | Show in sidebar | 开启后侧边栏出现图标 |
| 保护模式 | Protection mode | SSH 加载项里，需关闭才能访问系统目录 |
| 日志 | Log | 加载项的运行日志标签页 |
