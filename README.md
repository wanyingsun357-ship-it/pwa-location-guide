# 给自托管 AI 接入位置、到家迎接和高德打车

这份教程把一套自用实现拆成三个可以独立接入的功能。手机授权上报位置，聊天读取最近一笔位置，回家时由服务端唤醒指定会话。需要出门时，AI 查找地点和路线，生成高德打车入口。

```mermaid
flowchart LR
    A[PWA 前台定位或 iOS 原生定位] --> B[私有后端]
    S[iPhone 快捷指令到达事件] --> F
    B --> C[最近一次位置与更新时间]
    C --> D[聊天上下文与只读工具]
    B --> E[到家判定]
    E --> F[会话唤醒队列]
    F --> G[AI 回复与可选推送]
    D --> H[高德 MCP 地点与路线]
    H --> I[手机打开高德打车页]
```

## 1. 基础版：用 PWA 上报位置

准备一个 HTTPS PWA、一个私有后端，以及能读取位置状态的聊天服务。这条路线只需浏览器。用户在页面上点「更新我的位置」并授权后，调用 `navigator.geolocation.getCurrentPosition()`。已经开启位置分享的用户也可以选择在打开页面时刷新。需要在页面可见期间跟踪移动时，可使用 `watchPosition()`，离开页面或关闭分享时调用 `clearWatch()`。

从定位结果读取 `coords.latitude`、`coords.longitude`、`coords.accuracy` 和 `timestamp`。通过已配对会话或独立设备凭据上报。重试时保留原采集时间，供服务端拒绝乱序旧点。遇到拒绝授权或超时，显示上次位置的时间，并提供手动重试。

```http
POST /api/location
Authorization: Bearer <DEVICE_TOKEN>
Content-Type: application/json

{"lat":0.010,"lng":0.020,"acc":35,"capturedAt":"2026-01-01T12:00:00Z","src":"pwa"}
```

示例坐标只用于模拟。网页定位依赖页面可见与用户授权。纯 PWA 的到家迎接发生在页面取得新位置并上报后，例如回家打开聊天时。锁屏期间的到达信号由下面的进阶方案提供。[W3C Geolocation](https://www.w3.org/TR/geolocation/)

## 2. 聊天随时查询最近上报的位置

后端至少保存最新有效点、采集时间和精度。前端设置里提供分享开关、主动刷新和删除已存位置。服务端校验经纬度范围、设备权限和时间顺序，读写接口都做鉴权。使用系统坐标计算距离，地名反查可以异步完成。

给模型提供一个只读的 `get_recent_location` 工具，或在每轮拼接一行简短状态，例如「最近位置：离家约 600 米，8 分钟前上报」。只有确实需要路线时才提供精确坐标。我的实现会标注位置的年龄，超过 24 小时的原生位置不再作为当前状态注入。问「我现在在哪」时，如果数据过旧，就请用户刷新。

位置来源是手机系统定位。地名可由独立反查服务补充，我的现有实现使用 OpenStreetMap 的 Nominatim。接入外部反查时应告知用户坐标会发送给该服务，并遵循服务方的使用限制。高德在这里主要用于查地点、算路线和打开出行入口。

## 3. 用两道距离门槛触发到家迎接

用户选定家的位置和接收迎接的会话。用同一坐标系计算直线距离。当上一有效点距家 **超过 400 米**，新点进入 **200 米以内**，且距上次迎接已过 **90 分钟**，就创建一条唤醒任务。这是我当前实现的判定方式，200 与 400 米之间的缓冲有助于减少边界抖动。

唤醒任务只需携带事件 ID、目标会话和「刚到家」的原因。后台 worker 消费后调用模型写一句自然问候，落库并按需推送。正式部署时用事务或持久队列同时写入事件和去重状态，worker 按事件 ID 幂等处理。首次上报就在家里时，仅记录状态。若两次上报之间经过了缓冲区，也可能漏掉一次到家事件。希望提高命中率时，可另行设计「已离家」状态或使用系统围栏，并在真机上验证。

用 Node.js 运行离线示例。它覆盖远处进家、冷却时间、初次上报、缓冲区和过期位置。

```sh
node demo.mjs
```

## 4. 接入高德地点搜索与打车页

在高德开放平台创建应用和相应 Key，按官方文档把高德 MCP 加到自己的 AI 客户端。凭据放在私有配置，先用一个公共地点测试搜索，再接入聊天工具。

1. 用 `maps_text_search` 找目的地。城市字段只填城市名或城市编码，开启限城，区、街道和地标放进关键词。回包城市不符就丢弃重查。问「最近」时从明确的出发点做周边搜索，再比较实际路线。
2. 从最近位置或用户指定地点确认上车点，核对下车点名称与坐标。坐标传入高德前要按服务要求处理坐标系和经纬度顺序。Core Location 上报与地图服务可能使用不同坐标系，接入时用服务支持的坐标转换能力。
3. 调用当前 MCP 提供的打车唤端工具。我的接入里工具名为 `maps_schema_take_taxi`。参数以客户端实际展示的 schema 为准。将返回链接放在「打开高德打车」按钮里，由本人在高德确认起终点、报价和服务商后下单。

这条链路产出的是高德打车入口。是否能在高德选择滴滴，取决于页面当前提供的服务商。记录实际下单结果需要另外接入订单能力。[高德 MCP 官方能力与接入](https://developer.amap.com/api/mcp-server/summary)

## 5. 进阶版：锁屏到家也能唤醒会话

### PWA 加 iPhone 快捷指令

在快捷指令的「自动化」中选择「到达」，在自己的手机上设定范围。按设备上的选项设为自动运行，并用「获取 URL 内容」向自己的 HTTPS 后端发送 POST 请求。可以只发送 `{"event":"arrived_home"}`，无需在请求中带坐标。

后端需要实现单独的到达事件入口，例如 `POST /api/arrival`。给它分配只允许提交到达事件的凭据。验证凭据后按用户配置选择会话，对重试做去重，并复用迎接冷却和唤醒队列。到达事件只能更新到家状态，最近坐标仍以最后一次真实上报为准。这是可选接法，离线示例只验证距离判定。使用前在自己的设备上试一次锁屏到达，确认动作权限和请求是否成功。[Apple 到达触发器](https://support.apple.com/guide/shortcuts/travel-triggers-apd8ebfc4e8e/ios) · [Apple 自动运行设置](https://support.apple.com/guide/shortcuts/enable-or-disable-a-personal-automation-apd602971e63/ios)

### PWA 加 iOS 原生壳

这是我的现有实现。原生端用 Core Location 的 `requestLocation()` 取前台位置，获始终授权后用 `startMonitoringSignificantLocationChanges()` 接收后台更新，再走相同的位置上报和距离判定。按采用的定位服务配置用途描述及后台能力。关闭分享时停止监听，服务端同步拒绝上报。锁屏更新由系统调度，验收时检查采集时间和实际回包。[Apple 定位授权](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services) · [显著位置变化](https://developer.apple.com/documentation/corelocation/cllocationmanager/startmonitoringsignificantlocationchanges())
