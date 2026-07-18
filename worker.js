function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        }
    });
}

import { connect } from "cloudflare:sockets";
import { EmailMessage } from "cloudflare:email";

const CF_EMAIL_FROM = "";
const CF_EMAIL_TO = "";
const DEFAULT_NOTIFY_TEMPLATE = {
    failure_title:"🚨 {{site_name}} 监控告警",
    failure_body:"🚨 监控告警\n\n监控名称：{{site_name}}\n当前状态：离线\n故障原因：{{message}}\n连续失败：{{fail_count}} 次\n响应时间：{{response_time}} ms\n监控地址：{{url}}\n发生时间：{{occurred_at}}",
    recovery_title:"✅ {{site_name}} 服务恢复",
    recovery_body:"✅ 服务恢复\n\n监控名称：{{site_name}}\n当前状态：运行正常\n故障持续：{{duration}}\n响应时间：{{response_time}} ms\n恢复时间：{{recovered_at}}"
};

// --- Migration ---
async function migrate(env) {
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN check_interval INTEGER DEFAULT 1").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN last_checked_at INTEGER").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN fail_threshold INTEGER DEFAULT 1").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN enabled INTEGER DEFAULT 1").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN json_path TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN expected_value TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN keyword_mode TEXT DEFAULT 'exists'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN request_method TEXT DEFAULT 'GET'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN request_headers TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN request_body TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN user_agent TEXT DEFAULT 'CoolMonitor/1.1'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE sites ADD COLUMN deleted_at DATETIME").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE checks ADD COLUMN request_data TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE checks ADD COLUMN response_data TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS menus (id INTEGER PRIMARY KEY AUTOINCREMENT, menu_key TEXT UNIQUE, name TEXT NOT NULL, url TEXT NOT NULL, icon TEXT DEFAULT 'fa-link', parent_key TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, is_system INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run(); } catch (e) {}
    try { await env.DB.prepare("UPDATE sites SET enabled=1 WHERE enabled IS NULL").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]'").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''").run(); } catch (e) {}
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN enabled INTEGER DEFAULT 1").run(); } catch (e) {}
    try { await env.DB.prepare("UPDATE users SET role='admin' WHERE role IS NULL OR role='' ").run(); } catch (e) {}
}

const ALL_PERMISSIONS = ["dashboard.view","sites.view","sites.create","sites.edit","sites.delete","sites.check","logs.view","logs.delete","settings.view","settings.edit","notifications.view","notifications.edit","users.view","users.create","users.edit","users.delete","users.permissions"];
const ROLE_PERMISSIONS = {
    admin: ALL_PERMISSIONS,
    user: ["dashboard.view","sites.view","sites.create","sites.edit","sites.check","logs.view"],
    visitor: ["dashboard.view","sites.view","logs.view"]
};
const DEFAULT_USER_AGENTS = [
    { id:"coolmonitor", name:"CoolMonitor 默认", value:"CoolMonitor/1.1" },
    { id:"iphone", name:"Apple iPhone", value:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" },
    { id:"mac", name:"Apple Mac", value:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" },
    { id:"ipad", name:"Apple iPad", value:"Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" },
    { id:"android", name:"Android 手机", value:"Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" },
    { id:"huawei", name:"华为手机", value:"Mozilla/5.0 (Linux; Android 14; HUAWEI Mate 60 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 HuaweiBrowser/15.0 Mobile Safari/537.36" },
    { id:"windows_chrome", name:"Windows Chrome", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    { id:"windows_edge", name:"Windows Microsoft Edge", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0" },
    { id:"windows_firefox", name:"Windows Firefox", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0" },
    { id:"windows_360", name:"Windows 360 安全浏览器", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 QIHU 360SE" },
    { id:"windows_qq", name:"Windows QQ 浏览器", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 QQBrowser/12.5" },
    { id:"windows", name:"Windows 桌面系统", value:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36" },
    { id:"linux_chrome", name:"Linux Chrome", value:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    { id:"android_edge", name:"Android Microsoft Edge", value:"Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0" },
    { id:"android_firefox", name:"Android Firefox", value:"Mozilla/5.0 (Android 15; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0" }
];
function normalizePermissions(role, raw) {
    if (role === "admin") return [...ALL_PERMISSIONS];
    try {
        const parsed = Array.isArray(raw) ? raw : JSON.parse(raw || "[]");
        return parsed.filter(p => ALL_PERMISSIONS.includes(p));
    } catch { return [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.visitor)]; }
}
function publicUser(user) {
    return { id: user.id, username: user.username, display_name: user.display_name || "", role: user.role || "visitor", enabled: user.enabled !== 0, permissions: normalizePermissions(user.role, user.permissions), created_at: user.created_at };
}

// --- SHA-256 helpers ---
async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- JWT-like token ---
function base64UrlEncode(str) {
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64UrlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return atob(str);
}
async function generateToken(env, user) {
    const payload = { exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, iat: Math.floor(Date.now() / 1000), username: user.username, uid: user.id };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(env.JWT_SECRET + encodedPayload);
    return `${encodedPayload}.${signature}`;
}
async function currentUser(request, env) {
    const auth = await verifyToken(request, env);
    if (!auth) return null;
    const user = await env.DB.prepare("SELECT * FROM users WHERE id=? AND enabled=1").bind(auth.uid || -1).first();
    if (user) return publicUser(user);
    const fallback = await env.DB.prepare("SELECT * FROM users WHERE username=? AND enabled=1").bind(auth.username).first();
    return fallback ? publicUser(fallback) : null;
}
function can(user, permission) { return !!user && (user.role === "admin" || user.permissions.includes(permission)); }
function forbidden() { return json({ error: "Forbidden", message: "当前账号没有此操作权限" }, 403); }
async function verifyToken(request, env) {
    const header = request.headers.get("Authorization");
    if (!header || !header.startsWith("Bearer ")) return false;
    const token = header.split(" ")[1];
    try {
        const [encodedPayload, signature] = token.split(".");
        const expectedSig = base64UrlEncode(env.JWT_SECRET + encodedPayload);
        if (signature !== expectedSig) return false;
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (payload.exp < Math.floor(Date.now() / 1000)) return false;
        return payload;
    } catch { return false; }
}

// --- Auth handlers ---
async function handleLogin(request, env) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const { username, password } = await request.json();
    if (!username || !password) return json({ success: false, message: "请输入账号和密码" });
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!user) return json({ success: false, message: "账号或密码错误" });
    const hashed = await sha256(password + ":" + user.salt);
    if (hashed !== user.password) return json({ success: false, message: "账号或密码错误" });
    if (user.enabled === 0) return json({ success: false, message: "账号已被停用" });
    const token = await generateToken(env, user);
    return json({ success: true, token, user: publicUser(user), username: user.username });
}
async function handleRegister(request, env) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const { username, password } = await request.json();
    if (!username || !password) return json({ success: false, message: "请输入账号和密码" });
    if (password.length < 6) return json({ success: false, message: "密码不能少于6位" });
    const admin = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
    if (admin) return json({ success:false,message:"系统已有管理员，公开注册已关闭" },403);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return json({ success: false, message: "用户已存在" });
    const salt = Math.random().toString(36).substring(2, 10);
    const hashed = await sha256(password + ":" + salt);
    const created=await env.DB.prepare("INSERT INTO users (username,password,salt,role,permissions,enabled) SELECT ?,?,?,'admin',?,1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')").bind(username,hashed,salt,JSON.stringify(ALL_PERMISSIONS)).run();
    if(!(created.meta?.changes||0)) return json({success:false,message:"系统已有管理员，公开注册已关闭"},403);
    return json({ success: true, message: "注册成功" });
}
async function getRegisterStatus(env){const admin=await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();return json({registration_allowed:!admin})}
async function handleChangePassword(request, env) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const auth = await verifyToken(request, env);
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const { oldPassword, newPassword } = await request.json();
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(auth.username).first();
    if (!user) return json({ success: false, message: "用户不存在" });
    const oldHashed = await sha256(oldPassword + ":" + user.salt);
    if (oldHashed !== user.password) return json({ success: false, message: "原密码错误" });
    if (!newPassword || newPassword.length < 6) return json({ success: false, message: "新密码不能少于6位" });
    const newSalt = Math.random().toString(36).substring(2, 10);
    const newHashed = await sha256(newPassword + ":" + newSalt);
    await env.DB.prepare("UPDATE users SET password = ?, salt = ? WHERE username = ?").bind(newHashed, newSalt, auth.username).run();
    return json({ success: true, message: "密码修改成功" });
}
async function handleAuth(request, env) {
    const user = await currentUser(request, env);
    return json({ success: !!user, username: user ? user.username : null, user });
}
async function handleLogout(request, env) {
    return json({ success: true });
}

// --- Main ---
export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") return json({ success: true });
        const url = new URL(request.url);
        if (url.pathname.startsWith("/api/")) {
            await migrate(env);
            const publicAPI = ["/api/login", "/api/auth", "/api/register", "/api/register-status", "/api/health"];
            if (!publicAPI.includes(url.pathname)) {
                const pass = await currentUser(request, env);
                if (!pass) return json({ error: "Unauthorized" }, 401);
            }
            return apiRouter(request, env);
        }
        return env.ASSETS.fetch(request);
    },
    async scheduled(event, env) {
        await migrate(env);
        await monitor(env);
        const retention = await getRetentionDays(env);
        await env.DB.prepare("DELETE FROM checks WHERE created_at < datetime('now','+8 hours', ?)").bind(`-${retention} day`).run();
    }
};

async function apiRouter(request, env) {
    const url = new URL(request.url);
    const user = await currentUser(request, env);
    switch (url.pathname) {
        case "/api/login": return handleLogin(request, env);
        case "/api/auth": return handleAuth(request, env);
        case "/api/logout": return handleLogout(request, env);
        case "/api/register": return handleRegister(request, env);
        case "/api/register-status": return getRegisterStatus(env);
        case "/api/change-password": return handleChangePassword(request, env);
        case "/api/sites":
            if (request.method === "GET") return can(user,"sites.view") ? getSites(env, user) : forbidden();
            return saveSite(request, env, user);
        case "/api/status": return can(user,"dashboard.view") ? getStatus(env) : forbidden();
        case "/api/dashboard": return can(user,"dashboard.view") ? getDashboard(url, env) : forbidden();
        case "/api/history": return can(user,"sites.view") ? getHistory(url, env) : forbidden();
        case "/api/logs":
            if(request.method==="GET") return can(user,"logs.view") ? getLogs(url, env) : forbidden();
            return can(user,"logs.delete") ? deleteLogs(request, env) : forbidden();
        case "/api/log-detail": return can(user,"logs.view") ? getLogDetail(url, env) : forbidden();
        case "/api/user-agents": return can(user,"sites.view") ? getUserAgents(env) : forbidden();
        case "/api/menu-labels": return getMenuLabels(env);
        case "/api/custom-menus": return getCustomMenus(env);
        case "/api/notifications/test": return can(user,"notifications.edit") ? testNotifications(request, env) : forbidden();
        case "/api/users": return handleUsers(request, env, user);
        case "/api/permissions": return json({ permissions: ALL_PERMISSIONS, defaults: ROLE_PERMISSIONS });
        case "/api/settings":
            if (request.method === "GET") return can(user,"settings.view") ? getSettings(env, user) : forbidden();
            return can(user,"settings.edit") ? saveSettings(request, env) : forbidden();
        case "/api/check":
            if (!can(user,"sites.check")) return forbidden();
            const checkBody = await request.json().catch(() => ({}));
            const siteId = Number(checkBody.id);
            if (!Number.isInteger(siteId) || siteId <= 0) return json({ error: "请选择要检测的监控" }, 400);
            const checked = await monitor(env, { siteId, force: true });
            if (!checked) return json({ error: "监控不存在、已停用或已删除" }, 404);
            return json({ success: true, checked });
        case "/api/health": return json({ status: "ok", version: "1.3" });
        default: return json({ error: "API NOT FOUND" }, 404);
    }
}

async function getSites(env, user) {
    const result = await env.DB.prepare("SELECT s.*, (SELECT status FROM checks WHERE site_id=s.id ORDER BY id DESC LIMIT 1) status, (SELECT response_time FROM checks WHERE site_id=s.id ORDER BY id DESC LIMIT 1) response_time FROM sites s WHERE s.deleted_at IS NULL ORDER BY id DESC").all();
    if (!can(user, "sites.edit")) result.results.forEach(site => { site.request_headers = ""; site.request_body = ""; });
    return json(result.results);
}
async function saveSite(request, env, user) {
    const body = await request.json();
    if (body.action === "delete") {
        if (!can(user,"sites.delete")) return forbidden();
        const site = await env.DB.prepare("SELECT id FROM sites WHERE id=? AND deleted_at IS NULL").bind(body.id).first();
        if (!site) return json({ success: false, message: "监控项不存在" }, 404);
        const logs=await env.DB.prepare("SELECT COUNT(*) total FROM checks WHERE site_id=?").bind(body.id).first();
        await env.DB.prepare("UPDATE sites SET enabled=0,deleted_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.id).run();
        return json({ success: true, retained_logs:logs?.total||0 });
    }
        if (body.action === "edit") {
        if (!can(user,"sites.edit")) return forbidden();
        await env.DB.prepare("UPDATE sites SET site_name=?, url=?, type=?, keyword=?, keyword_mode=?, json_path=?, expected_value=?, request_method=?, request_headers=?, request_body=?, user_agent=?, timeout=?, check_interval=?, fail_threshold=? WHERE id=?")
            .bind(body.site_name, body.url, body.type || "http", body.keyword || "", body.keyword_mode || "exists", body.json_path || "", body.expected_value || "", body.request_method || "GET", body.request_headers || "", body.request_body || "", body.user_agent || "CoolMonitor/1.1", body.timeout || 10, body.check_interval || 1, body.fail_threshold || 1, body.id).run();
        return json({ success: true });
    }
    if (!can(user,"sites.create")) return forbidden();
    await env.DB.prepare("INSERT INTO sites (site_name, url, type, keyword, keyword_mode, json_path, expected_value, request_method, request_headers, request_body, user_agent, timeout, check_interval, fail_threshold, enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").bind(body.site_name, body.url, body.type || "http", body.keyword || "", body.keyword_mode || "exists", body.json_path || "", body.expected_value || "", body.request_method || "GET", body.request_headers || "", body.request_body || "", body.user_agent || "CoolMonitor/1.1", body.timeout || 10, body.check_interval || 1, body.fail_threshold || 1).run();
    return json({ success: true });
}

async function handleUsers(request, env, actor) {
    if (!can(actor, "users.view")) return forbidden();
    if (request.method === "GET") {
        const rows = await env.DB.prepare("SELECT id,username,display_name,role,permissions,enabled,created_at FROM users ORDER BY id").all();
        return json(rows.results.map(publicUser));
    }
    const body = await request.json();
    if (body.action === "create") {
        if (!can(actor,"users.create")) return forbidden();
        if (!body.username || !body.password || body.password.length < 6) return json({success:false,message:"用户名必填，密码至少6位"},400);
        const role = ROLE_PERMISSIONS[body.role] ? body.role : "visitor";
        const permissions = normalizePermissions(role, body.permissions || ROLE_PERMISSIONS[role]);
        const salt = crypto.randomUUID().replace(/-/g,"").slice(0,16);
        const hashed = await sha256(body.password + ":" + salt);
        try {
            await env.DB.prepare("INSERT INTO users(username,password,salt,display_name,role,permissions,enabled) VALUES(?,?,?,?,?,?,?)").bind(body.username,hashed,salt,body.display_name||"",role,JSON.stringify(permissions),body.enabled===false?0:1).run();
            return json({success:true});
        } catch { return json({success:false,message:"用户名已存在"},400); }
    }
    if (body.action === "edit") {
        if (!can(actor,"users.edit")) return forbidden();
        const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(body.id).first();
        if (!target) return json({success:false,message:"用户不存在"},404);
        const role = ROLE_PERMISSIONS[body.role] ? body.role : target.role;
        const permissions = can(actor,"users.permissions") ? normalizePermissions(role, body.permissions) : normalizePermissions(target.role,target.permissions);
        await env.DB.prepare("UPDATE users SET username=?,display_name=?,role=?,permissions=?,enabled=? WHERE id=?").bind(body.username,body.display_name||"",role,JSON.stringify(permissions),body.enabled===false?0:1,body.id).run();
        if (body.password) {
            if (body.password.length < 6) return json({success:false,message:"密码至少6位"},400);
            const salt = crypto.randomUUID().replace(/-/g,"").slice(0,16);
            await env.DB.prepare("UPDATE users SET password=?,salt=? WHERE id=?").bind(await sha256(body.password+":"+salt),salt,body.id).run();
        }
        return json({success:true});
    }
    if (body.action === "delete") {
        if (!can(actor,"users.delete")) return forbidden();
        if (Number(body.id) === Number(actor.id)) return json({success:false,message:"不能删除当前登录账号"},400);
        await env.DB.prepare("DELETE FROM users WHERE id=?").bind(body.id).run();
        return json({success:true});
    }
    return json({success:false,message:"未知操作"},400);
}
async function getStatus(env) {
    const total = await env.DB.prepare("SELECT COUNT(*) total FROM sites WHERE deleted_at IS NULL").first();
    const online = await env.DB.prepare("SELECT COUNT(*) online FROM sites WHERE deleted_at IS NULL AND (SELECT status FROM checks WHERE site_id=sites.id ORDER BY id DESC LIMIT 1)=1").first();
    const avg = await env.DB.prepare("SELECT AVG(response_time) avg FROM checks WHERE created_at > datetime('now','+8 hours','-1 day')").first();
    const uptime = await env.DB.prepare("SELECT AVG(CASE WHEN status=1 THEN 100 ELSE 0 END) rate FROM checks WHERE created_at > datetime('now','+8 hours','-1 day')").first();
    return json({ total: total.total || 0, online: online.online || 0, offline: (total.total || 0) - (online.online || 0), avg_response: Math.round(avg.avg || 0), uptime: Number((uptime.rate || 0).toFixed(2)) });
}
async function getHistory(url, env) {
    const id = url.searchParams.get("id");
    const result = await env.DB.prepare("SELECT status, response_time, http_code, message, datetime(created_at,'+8 hours') as created_at FROM checks WHERE site_id=? ORDER BY id DESC LIMIT 200").bind(id).all();
    return json(result.results);
}
async function getSettings(env, user) {
    const rows = await env.DB.prepare("SELECT * FROM settings").all();
    let data = {};
    rows.results.forEach(item => { data[item.key] = item.value; });
    if (!can(user,"notifications.edit") && data.notification_config) data.notification_config = "{}";
    return json(data);
}
async function saveSettings(request, env) {
    const body = await request.json();
    const allowed = ["log_retention_days","ua_profiles","menu_labels","custom_menus","notification_config"];
    for (const key in body) {
        if (!allowed.includes(key)) continue;
        if (key === "log_retention_days") body[key] = Math.min(3650, Math.max(1, parseInt(body[key]) || 30));
        if (key === "ua_profiles") {
            const profiles = Array.isArray(body[key]) ? body[key] : [];
            body[key] = JSON.stringify(profiles.slice(0,100).map(item => ({ id:String(item.id||crypto.randomUUID()), name:String(item.name||"").slice(0,60), value:String(item.value||"").slice(0,1000) })).filter(item => item.name && item.value));
        }
        if (key === "menu_labels") {
            const labels = body[key] && typeof body[key] === "object" ? body[key] : {};
            const allowedNames = ["dashboard","admin","logs","users","settings","notification_settings","menu_settings","ua_settings"];
            for (const name of allowedNames) if (labels[name]) await env.DB.prepare("UPDATE menus SET name=? WHERE menu_key=? AND is_system=1").bind(String(labels[name]).trim().slice(0,20),name).run();
            body[key] = JSON.stringify(Object.fromEntries(allowedNames.map(name => [name, String(labels[name] || "").trim().slice(0,20)]).filter(([,value]) => value)));
        }
        if (key === "custom_menus") {
            const menus = Array.isArray(body[key]) ? body[key] : [];
            const cleanMenus = menus.slice(0,50).map(item => ({ id:String(item.id||crypto.randomUUID()), name:String(item.name||"").trim().slice(0,30), url:String(item.url||"").trim().slice(0,1000) })).filter(item => item.name && /^(#|\/|https?:\/\/)/i.test(item.url));
            await env.DB.prepare("DELETE FROM menus WHERE is_system=0").run();
            for (let i=0;i<cleanMenus.length;i++) await env.DB.prepare("INSERT INTO menus(menu_key,name,url,icon,parent_key,sort_order,enabled,is_system) VALUES(?,?,?,'fa-link','',?,1,0)").bind(cleanMenus[i].id,cleanMenus[i].name,cleanMenus[i].url,100+i).run();
            body[key] = JSON.stringify(cleanMenus);
        }
        if (key === "notification_config") body[key] = JSON.stringify(sanitizeNotificationConfig(body[key]));
        await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(body[key])).run();
    }
    return json({ success: true });
}
async function getDashboard(url, env) {
    const allowedRanges = { "24h":1, "7d":7, "30d":30 };
    const range = url.searchParams.get("range") || "24h", days = allowedRanges[range] || 1;
    const modifier = `-${days} day`;
    const summary = await env.DB.prepare("SELECT COUNT(*) checks, SUM(CASE WHEN status=1 THEN 1 ELSE 0 END) successes, SUM(CASE WHEN status=0 THEN 1 ELSE 0 END) failures, AVG(response_time) avg_response, MAX(response_time) max_response FROM checks WHERE created_at >= datetime('now',?)").bind(modifier).first();
    const p95 = await env.DB.prepare("SELECT response_time FROM checks WHERE created_at >= datetime('now',?) ORDER BY response_time LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.95 AS INTEGER) FROM checks WHERE created_at >= datetime('now',?))").bind(modifier,modifier).first();
    const statusEvents = await env.DB.prepare("WITH ranked AS (SELECT c.id,c.site_id,s.site_name,c.status,c.response_time,c.message,datetime(c.created_at,'+8 hours') created_at,ROW_NUMBER() OVER (PARTITION BY c.site_id ORDER BY c.id DESC) rn FROM checks c JOIN sites s ON s.id=c.site_id WHERE s.deleted_at IS NULL AND c.created_at >= datetime('now',?)) SELECT id,site_id,site_name,status,response_time,message,created_at FROM ranked WHERE rn<=30 ORDER BY site_name,id").bind(modifier).all();
    return json({ range, checks:summary?.checks||0, successes:summary?.successes||0, failures:summary?.failures||0, avg_response:Math.round(summary?.avg_response||0), max_response:summary?.max_response||0, p95_response:p95?.response_time||0, success_rate:summary?.checks?Number(((summary.successes||0)*100/summary.checks).toFixed(2)):0, status_events:statusEvents.results });
}
async function getUserAgents(env) {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='ua_profiles'").first();
    if (!row?.value) return json(DEFAULT_USER_AGENTS);
    try { const parsed = JSON.parse(row.value); return json(Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_USER_AGENTS); } catch { return json(DEFAULT_USER_AGENTS); }
}
async function getMenuLabels(env) {
    try { const rows = await env.DB.prepare("SELECT menu_key,name FROM menus WHERE is_system=1 AND enabled=1").all(); return json(Object.fromEntries(rows.results.map(row => [row.menu_key,row.name]))); }
    catch { const row = await env.DB.prepare("SELECT value FROM settings WHERE key='menu_labels'").first(); try { return json(JSON.parse(row?.value || "{}")); } catch { return json({}); } }
}
async function getCustomMenus(env) {
    try { const rows = await env.DB.prepare("SELECT menu_key id,name,url FROM menus WHERE is_system=0 AND enabled=1 ORDER BY sort_order,id").all(); return json(rows.results); }
    catch { const row = await env.DB.prepare("SELECT value FROM settings WHERE key='custom_menus'").first(); try { return json(JSON.parse(row?.value || "[]")); } catch { return json([]); } }
}
async function getRetentionDays(env) {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='log_retention_days'").first();
    return Math.min(3650, Math.max(1, parseInt(row?.value) || 30));
}
async function monitor(env, options = {}) {
    const siteId = Number(options.siteId) || 0;
    const sites = siteId ? await env.DB.prepare("SELECT * FROM sites WHERE enabled=1 AND deleted_at IS NULL AND id=?").bind(siteId).all() : await env.DB.prepare("SELECT * FROM sites WHERE enabled=1 AND deleted_at IS NULL").all();
    const now = Math.floor(Date.now() / 1000);
    let checked = 0;
    for (const site of sites.results) {
        const intervalSec = (site.check_interval || 1) * 60;
        const lastCheck = site.last_checked_at || 0;
        if (!options.force && now - lastCheck < intervalSec) continue;
        const result = await checkSite(site);
        checked++;
        await env.DB.prepare("UPDATE sites SET last_checked_at=? WHERE id=?").bind(now, site.id).run();
        const logInsert=await env.DB.prepare("INSERT INTO checks (site_id, status, response_time, http_code, message, request_data, response_data) VALUES (?,?,?,?,?,?,?)").bind(site.id, result.status, result.time, result.code, result.message, result.request_data || "", result.response_data || "").run();
        const eventMeta={log_id:logInsert.meta?.last_row_id||"",occurred_at:formatNotifyTime(),recovered_at:formatNotifyTime(),duration:`约 ${Math.max(1,(site.fail_count||1)*(site.check_interval||1))} 分钟`};
        if (result.status === 1) {
            await env.DB.prepare("UPDATE sites SET fail_count=0 WHERE id=?").bind(site.id).run();
            if ((site.fail_count || 0) >= (site.fail_threshold || 1)) await sendNotify(env, { type:"recovery", site, result, ...eventMeta });
        } else {
            await env.DB.prepare("UPDATE sites SET fail_count= fail_count+1 WHERE id=?").bind(site.id).run();
            const nextFailCount = (site.fail_count || 0) + 1;
            if (nextFailCount === (site.fail_threshold || 1)) await sendNotify(env, { type:"failure", site:{...site,fail_count:nextFailCount}, result, ...eventMeta });
        }
    }
}
async function checkSite(site) {
    if (site.type === "tcp") return checkTcpSite(site);
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (site.timeout || 10) * 1000);
    let requestPacket = { method: "GET", url: site.url, headers: {}, body: "", sent_at: new Date().toISOString() };
    try {
        const requestedMethod=String(site.request_method||"GET").toUpperCase();
        const method=["GET","POST","PUT","PATCH","DELETE","HEAD"].includes(requestedMethod)?requestedMethod:"GET";
        let customHeaders = {};
        if (site.request_headers) {
            try {
                customHeaders = JSON.parse(site.request_headers);
                if (!customHeaders || Array.isArray(customHeaders) || typeof customHeaders !== "object") throw new Error();
            }
            catch { throw new Error("请求头 JSON 格式错误"); }
        }
        const options = { method, redirect: "follow", signal: controller.signal, headers: { ...customHeaders, "User-Agent": site.user_agent || "CoolMonitor/1.1" } };
        if (!["GET","HEAD"].includes(method) && site.request_body) options.body = site.request_body;
        requestPacket = { method, url: site.url, headers: options.headers, body: options.body || "", sent_at: new Date().toISOString() };
        const response = await fetch(site.url, options);
        clearTimeout(timer);
        const capturedBody = await response.clone().text();
        const responsePacket = { status: response.status, status_text: response.statusText, url: response.url, redirected: response.redirected, headers: Object.fromEntries(response.headers), body: capturedBody, received_at: new Date().toISOString() };
        const packets = { request_data: serializePacket(requestPacket), response_data: serializePacket(responsePacket) };
        let ok = response.status >= 200 && response.status < 400;
        let text = "";
        if (site.type === "keyword") {
            text = await response.text();
            const found = text.includes(site.keyword);
            ok = site.keyword_mode === "not_exists" ? !found : found;
            return { status: ok ? 1 : 0, time: Date.now() - start, code: response.status, message: ok ? `关键词检测通过 (${site.keyword_mode === "not_exists" ? "不包含" : "包含"})，HTTP ${response.status}` : `关键词检测失败: ${site.keyword}，HTTP ${response.status}`, ...packets };
        }
        if (site.type === "json") {
            const data = await response.json();
            const actual = getJsonPath(data, site.json_path || "");
            ok = ok && actual !== undefined && (site.expected_value === "" || String(actual) === String(site.expected_value));
            return { status: ok ? 1 : 0, time: Date.now() - start, code: response.status, message: ok ? `JSON 断言通过: ${site.json_path}=${String(actual)}` : `JSON 断言失败: 实际值 ${String(actual)}`, ...packets };
        }
        if (site.type === "ssl") {
            const isHttps = new URL(site.url).protocol === "https:";
            ok = ok && isHttps;
            return { status: ok ? 1 : 0, time: Date.now() - start, code: response.status, message: ok ? "SSL/TLS 证书有效，握手成功" : "SSL/TLS 检测失败", ...packets };
        }
        return { status: ok ? 1 : 0, time: Date.now() - start, code: response.status, message: ok ? "OK" : "Check Failed", ...packets };
    } catch (e) {
        clearTimeout(timer);
        return { status: 0, time: Date.now() - start, code: 0, message: e.message, request_data: serializePacket(requestPacket), response_data: serializePacket({ error: e.message, received_at: new Date().toISOString() }) };
    }
    return checked;
}
function serializePacket(packet) {
    const maxBodyChars = 131072;
    const copy = { ...packet };
    if (typeof copy.body === "string" && copy.body.length > maxBodyChars) {
        copy.original_body_length = copy.body.length;
        copy.body = copy.body.slice(0, maxBodyChars);
        copy.body_truncated = true;
    }
    return JSON.stringify(copy);
}
function getJsonPath(data, path) {
    if (!path) return data;
    return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], data);
}
async function checkTcpSite(site) {
    const start = Date.now();
    let socket;
    try {
        const raw = String(site.url || "").replace(/^tcp:\/\//i, "");
        const separator = raw.lastIndexOf(":");
        const hostname = separator > -1 ? raw.slice(0, separator) : raw;
        const port = separator > -1 ? Number(raw.slice(separator + 1)) : 80;
        if (!hostname || !port || port < 1 || port > 65535) throw new Error("主机或端口无效");
        socket = connect({ hostname, port });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TCP 连接超时")), (site.timeout || 10) * 1000));
        await Promise.race([socket.opened, timeout]);
        socket.close();
        return { status: 1, time: Date.now() - start, code: port, message: `TCP ${hostname}:${port} 连接成功`, request_data: serializePacket({ protocol:"TCP", hostname, port, sent_at:new Date(start).toISOString() }), response_data: serializePacket({ connected:true, elapsed_ms:Date.now()-start, received_at:new Date().toISOString() }) };
    } catch (e) {
        try { if (socket) socket.close(); } catch {}
        return { status: 0, time: Date.now() - start, code: 0, message: e.message || "TCP 连接失败", request_data: serializePacket({ protocol:"TCP", target:site.url, sent_at:new Date(start).toISOString() }), response_data: serializePacket({ connected:false, error:e.message, received_at:new Date().toISOString() }) };
    }
}
async function getLogs(url, env) {
    const siteId = url.searchParams.get("site_id") || "";
    const status = url.searchParams.get("status") || "";
    const keyword = url.searchParams.get("keyword") || "";
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const offset = parseInt(url.searchParams.get("offset")) || 0;
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    let conditions = ["1=1"];
    let params = [];
    if (siteId) { conditions.push("c.site_id=?"); params.push(siteId); }
    if (status !== "") { conditions.push("c.status=?"); params.push(parseInt(status)); }
    if (keyword) { conditions.push("c.message LIKE ?"); params.push("%" + keyword + "%"); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) { conditions.push("datetime(c.created_at,'+8 hours') >= ?"); params.push(dateFrom + " 00:00:00"); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) { conditions.push("datetime(c.created_at,'+8 hours') < datetime(?,'+1 day')"); params.push(dateTo + " 00:00:00"); }
    const whereSQL = "WHERE " + conditions.join(" AND ");
    const count = await env.DB.prepare("SELECT COUNT(*) total FROM checks c " + whereSQL).bind(...params).first();
    const result = await env.DB.prepare("SELECT c.id,c.site_id,CASE WHEN s.id IS NULL THEN '已删除' WHEN s.deleted_at IS NOT NULL THEN s.site_name||'（已删除）' ELSE s.site_name END site_name,c.status,c.response_time,c.http_code,c.message,datetime(c.created_at,'+8 hours') created_at FROM checks c LEFT JOIN sites s ON c.site_id=s.id " + whereSQL + " ORDER BY c.id DESC LIMIT ? OFFSET ?").bind(...params, limit, offset).all();
    return json({ total: count.total || 0, rows: result.results });
}
async function deleteLogs(request, env) {
    if(request.method!=="POST") return json({error:"Method not allowed"},405);
    const body=await request.json().catch(()=>({}));
    if(body.action==="delete_filtered") {
        const filters=body.filters&&typeof body.filters==="object"?body.filters:{};let conditions=["1=1"],params=[];
        if(filters.site_id){conditions.push("site_id=?");params.push(String(filters.site_id))}
        if(filters.status!==undefined&&filters.status!==""){conditions.push("status=?");params.push(parseInt(filters.status))}
        if(filters.keyword){conditions.push("message LIKE ?");params.push("%"+String(filters.keyword).slice(0,200)+"%")}
        if(/^\d{4}-\d{2}-\d{2}$/.test(filters.date_from||"")){conditions.push("datetime(created_at,'+8 hours') >= ?");params.push(filters.date_from+" 00:00:00")}
        if(/^\d{4}-\d{2}-\d{2}$/.test(filters.date_to||"")){conditions.push("datetime(created_at,'+8 hours') < datetime(?,'+1 day')");params.push(filters.date_to+" 00:00:00")}
        const result=await env.DB.prepare("DELETE FROM checks WHERE "+conditions.join(" AND ")).bind(...params).run();return json({success:true,deleted:result.meta?.changes||0});
    }
    const ids=[...new Set((Array.isArray(body.ids)?body.ids:[]).map(Number).filter(id=>Number.isInteger(id)&&id>0))].slice(0,500);
    if(!ids.length) return json({success:false,message:"请选择需要删除的日志"},400);
    const placeholders=ids.map(()=>"?").join(",");
    const result=await env.DB.prepare(`DELETE FROM checks WHERE id IN (${placeholders})`).bind(...ids).run();
    return json({success:true,deleted:result.meta?.changes||ids.length});
}
async function getLogDetail(url, env) {
    const id = parseInt(url.searchParams.get("id"));
    if (!id) return json({ error: "Invalid log id" }, 400);
    const row = await env.DB.prepare("SELECT c.id,c.site_id,CASE WHEN s.id IS NULL THEN '已删除' WHEN s.deleted_at IS NOT NULL THEN s.site_name||'（已删除）' ELSE s.site_name END site_name,c.status,c.response_time,c.http_code,c.message,datetime(c.created_at,'+8 hours') created_at,c.request_data,c.response_data FROM checks c LEFT JOIN sites s ON c.site_id=s.id WHERE c.id=?").bind(id).first();
    if (!row) return json({ error: "Log not found" }, 404);
    try { row.request_data = JSON.parse(row.request_data || "{}"); } catch { row.request_data = { raw: row.request_data || "" }; }
    try { row.response_data = JSON.parse(row.response_data || "{}"); } catch { row.response_data = { raw: row.response_data || "" }; }
    return json(row);
}
function sanitizeNotificationConfig(raw) {
    const source = typeof raw === "string" ? (()=>{try{return JSON.parse(raw)}catch{return {}}})() : (raw || {});
    const clean = value => String(value || "").trim().slice(0,2000);
    return {
        enabled: !!source.enabled, notify_failure: source.notify_failure !== false, notify_recovery: source.notify_recovery !== false,
        email:{ enabled:!!source.email?.enabled, provider:"cloudflare", from:clean(source.email?.from)||CF_EMAIL_FROM, to:clean(source.email?.to)||CF_EMAIL_TO },
        wecom:{ enabled:!!source.wecom?.enabled, webhook:clean(source.wecom?.webhook) },
        telegram:{ enabled:!!source.telegram?.enabled, bot_token:clean(source.telegram?.bot_token), chat_id:clean(source.telegram?.chat_id) },
        template:{failure_title:clean(source.template?.failure_title)||DEFAULT_NOTIFY_TEMPLATE.failure_title,failure_body:clean(source.template?.failure_body)||DEFAULT_NOTIFY_TEMPLATE.failure_body,recovery_title:clean(source.template?.recovery_title)||DEFAULT_NOTIFY_TEMPLATE.recovery_title,recovery_body:clean(source.template?.recovery_body)||DEFAULT_NOTIFY_TEMPLATE.recovery_body}
    };
}
async function getNotificationConfig(env) {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='notification_config'").first();
    return sanitizeNotificationConfig(row?.value || "{}");
}
async function sendNotify(env, event, force=false) {
    const cfg = await getNotificationConfig(env);
    if (!force && (!cfg.enabled || (event.type==="failure"&&!cfg.notify_failure) || (event.type==="recovery"&&!cfg.notify_recovery))) return [];
    if(event.type!=="test") event={...event,...renderNotificationEvent(cfg.template,event)};
    const jobs=[];
    const requestChannel=(url,options)=>fetch(url,options).then(async response=>{if(!response.ok)throw new Error((await response.text()).slice(0,300));return response.status});
    if(cfg.email.enabled&&cfg.email.from&&cfg.email.to&&env.EMAIL) jobs.push(sendCloudflareEmail(env,cfg.email.from,cfg.email.to,event.title,event.message));
    if(cfg.wecom.enabled&&cfg.wecom.webhook) jobs.push(requestChannel(cfg.wecom.webhook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({msgtype:"markdown",markdown:{content:`**${event.title}**\n>${event.message}`}})}));
    if(cfg.telegram.enabled&&cfg.telegram.bot_token&&cfg.telegram.chat_id) jobs.push(requestChannel(`https://api.telegram.org/bot${cfg.telegram.bot_token}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:cfg.telegram.chat_id,text:`${event.title}\n${event.message}`})}));
    return Promise.allSettled(jobs);
}
function formatNotifyTime(){return new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date()).replaceAll("/","-")}
function renderNotificationEvent(template,event){const site=event.site||{},result=event.result||{},values={site_name:site.site_name||"未知监控",status:event.type==="recovery"?"运行正常":"离线",url:site.url||"",type:site.type||"",message:result.message||"检测失败",http_code:result.code||0,response_time:result.time||0,fail_count:site.fail_count||0,fail_threshold:site.fail_threshold||1,occurred_at:event.occurred_at||formatNotifyTime(),recovered_at:event.recovered_at||formatNotifyTime(),duration:event.duration||"未知",log_id:event.log_id||""};const fill=value=>String(value||"").replace(/\{\{([a-z_]+)\}\}/g,(_,key)=>String(values[key]??""));const prefix=event.type==="recovery"?"recovery":"failure";return{title:fill(template[prefix+"_title"]),message:fill(template[prefix+"_body"])}}
function encodeMimeHeader(value){const bytes=new TextEncoder().encode(String(value));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return `=?UTF-8?B?${btoa(binary)}?=`}
async function sendCloudflareEmail(env,from,to,subject,text){
    const sender=String(from).trim(),recipient=String(to).trim(),senderDomain=sender.split("@")[1]||"example.com";
    const raw=[`From: CoolMonitor <${sender}>`,`To: ${recipient}`,`Subject: ${encodeMimeHeader(subject)}`,`Date: ${new Date().toUTCString()}`,`Message-ID: <${crypto.randomUUID()}@${senderDomain}>`,`MIME-Version: 1.0`,`Content-Type: text/plain; charset=UTF-8`,`Content-Transfer-Encoding: 8bit`,``,`CoolMonitor 监控通知\r\n\r\n${text}\r\n`,`本邮件由 CoolMonitor 自动发送，请勿直接回复。`].join("\r\n");
    return env.EMAIL.send(new EmailMessage(sender,recipient,raw));
}
async function testNotifications(request, env) {
    if(request.method!=="POST") return json({error:"Method not allowed"},405);
    const results=await sendNotify(env,{type:"failure",site:{site_name:"CoolMonitor 测试监控",url:"https://example.com",type:"http",fail_count:3,fail_threshold:3,check_interval:1},result:{message:"这是一条模板测试通知",code:0,time:1000},log_id:"TEST",occurred_at:formatNotifyTime(),duration:"约 3 分钟"},true);
    const failed=results.filter(r=>r.status==="rejected").length;
    return json({success:failed===0,channels:results.length,failed,results:results.map(r=>({status:r.status,error:r.status==="rejected"?String(r.reason?.message||r.reason||"未知错误").slice(0,500):""}))});
}
