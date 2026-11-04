# 零基础跟做

## 1. 在电脑上跑通

安装 Node.js 22 或更新版本。点 GitHub 的 Code → Download ZIP，解压后在包含 starter.mjs 的目录打开终端。

Windows PowerShell：

```powershell
$env:LOCATION_TOKEN = 'local-location-example-only'
$env:ARRIVAL_TOKEN = 'local-arrival-example-only'
node starter.mjs
```

macOS 或 Linux：

```sh
LOCATION_TOKEN=local-location-example-only ARRIVAL_TOKEN=local-arrival-example-only node starter.mjs
```

浏览器打开 http://127.0.0.1:8787/，填位置令牌，点「上报虚构位置」，再点「查看最近位置和迎接」。另开一个 PowerShell 窗口模拟到家：

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/arrival -Headers @{Authorization='Bearer local-arrival-example-only'} -ContentType application/json -Body '{"event":"arrived_home","id":"first-test"}'
```

macOS 或 Linux：

```sh
curl -X POST http://127.0.0.1:8787/api/arrival -H 'Authorization: Bearer local-arrival-example-only' -H 'Content-Type: application/json' -d '{"event":"arrived_home","id":"first-test"}'
```

回测试页再点查看，应看到欢迎语。重复请求应得到 duplicate。测试服务使用固定欢迎语，状态保存在内存，重启后清空。接真实聊天时，由自己的后端读取 GET /api/status 并把位置和采集时间提供给模型。主动迎接可在收到新到家事件时写入持久队列，参照[主教程](README.md)。距离判断可单独用 node demo.mjs 验证。

## 2. 让手机访问

把 starter.mjs 和 starter.html 放到自己控制的服务器。运行两次下面的命令生成两个不同的随机令牌，替换本地示例值，再启动服务。

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

用 HTTPS 反向代理指向服务器本机的 127.0.0.1:8787。例如域名已经解析且 Caddy 可以办理证书时，在 Caddyfile 中加入以下配置并重载。用自己的域名替换示例域名。

```caddyfile
location.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

手机打开 HTTPS 页面，先试虚构位置，再选择是否授权上报本机位置。位置令牌可读写位置状态，到家令牌只能发事件。长期使用时将样例接入自己的设备配对、持久化和撤销机制。令牌只填在自己的设备和服务端，分享截图时用虚构数据。

## 3. iPhone 快捷指令

1. 打开「快捷指令 → 自动化 → ＋ → 到达」，选地点与范围，选择「立即运行」或系统提供的自动运行选项。
2. 建立空白自动化，添加「当前日期」和「格式化日期」，日期格式选 ISO 8601，作为本次事件 ID。
3. 加「获取 URL 内容」，填 https://location.example.com/api/arrival，方法选 POST。标头 Authorization 的值填 Bearer、一个空格、到家令牌。
4. 请求体选 JSON，添加文本字段 event，值填 arrived_home。再添加文本字段 id，值选择第 2 步格式化后的日期。
5. 先解锁运行一次并允许联网，再锁屏走出范围后返回，查看测试页的迎接时间。手动测试和实地测试之间可重启演示服务清空冷却，或等 90 分钟。

[Apple 到达自动化](https://support.apple.com/guide/shortcuts/travel-triggers-apd8ebfc4e8e/ios)

## 4. Android Tasker

1. 在 Tasks 新建任务 Arrived Home，添加 HTTP Request，方法选 POST，URL 填 https://location.example.com/api/arrival。
2. Headers 分两行填 Content-Type: application/json 和 Authorization: Bearer 你的到家令牌。Body 填下面的 JSON。%TIMEMS 生成事件 ID，重试同一事件时保留原 ID。
3. 点运行，确认返回 200。在 Profiles 新建 Location 配置，选家的范围，将进入任务绑定到 Arrived Home。
4. 按手机提示授予位置及所需的后台权限，实际锁屏离开再进圈。查看测试页的迎接时间。两次测试间等 90 分钟或重启演示服务清空状态。
5. 需要路上位置时另建任务，先用 Get Location v2，再用 HTTP Request 向 /api/location POST。将定位动作输出的纬度、经度和精度分别填进 lat、lng、acc 数字字段，采集时间转成 ISO 8601 填 capturedAt，改用位置令牌。先手动跑通，再添加时间 Profile。

```json
{"event":"arrived_home","id":"tasker-%TIMEMS"}
```

[Tasker HTTP Request](https://tasker.joaoapps.com/userguide/en/help/ah_http_request.html) · [Tasker Get Location v2](https://tasker.joaoapps.com/userguide/en/help/ah_get_current_location.html)

## 5. 看懂返回

- 401 表示令牌或标头不匹配。两个 POST 路由分别用各自的令牌。
- 400 表示请求体、坐标或采集时间需要检查。409 表示位置与已有数据一样旧或更旧。
- 200 加 duplicate 或 cooldown 表示事件已收到，这次没有新迎接。
- 锁屏后收不到请求时，先查自动化、系统权限和网络。到家事件成功但坐标没变时，检查设备有没有单独上报新坐标。
