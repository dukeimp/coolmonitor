PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'http',
    keyword TEXT DEFAULT '',
    keyword_mode TEXT NOT NULL DEFAULT 'exists',
    json_path TEXT DEFAULT '',
    expected_value TEXT DEFAULT '',
    request_method TEXT NOT NULL DEFAULT 'GET',
    request_headers TEXT DEFAULT '',
    request_body TEXT DEFAULT '',
    user_agent TEXT DEFAULT 'CoolMonitor/1.1',
    timeout INTEGER NOT NULL DEFAULT 10,
    enabled INTEGER NOT NULL DEFAULT 1,
    fail_count INTEGER NOT NULL DEFAULT 0,
    check_interval INTEGER NOT NULL DEFAULT 5,
    last_checked_at INTEGER,
    fail_threshold INTEGER NOT NULL DEFAULT 3,
    deleted_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    response_time INTEGER NOT NULL DEFAULT 0,
    http_code INTEGER NOT NULL DEFAULT 0,
    message TEXT DEFAULT '',
    request_data TEXT DEFAULT '',
    response_data TEXT DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT DEFAULT 'fa-link',
    parent_key TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notify (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    target TEXT,
    enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'visitor',
    permissions TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checks_site ON checks(site_id);
CREATE INDEX IF NOT EXISTS idx_checks_time ON checks(created_at);
CREATE INDEX IF NOT EXISTS idx_sites_active ON sites(deleted_at, enabled);

INSERT OR IGNORE INTO settings(key, value) VALUES
    ('log_retention_days', '30'),
    ('notification_config', '{"enabled":false,"notify_failure":true,"notify_recovery":true,"email":{"enabled":false,"provider":"cloudflare","from":"","to":""},"wecom":{"enabled":false,"webhook":""},"telegram":{"enabled":false,"bot_token":"","chat_id":""}}');

INSERT OR IGNORE INTO menus(menu_key, name, url, icon, parent_key, sort_order, enabled, is_system) VALUES
    ('dashboard', '仪表盘', '#dashboard', 'fa-tachometer-alt', '', 10, 1, 1),
    ('admin', '监控管理', '#admin', 'fa-cog', '', 20, 1, 1),
    ('logs', '监控日志', '#logs', 'fa-list-alt', '', 30, 1, 1),
    ('users', '用户管理', '#users', 'fa-users', '', 40, 1, 1),
    ('notification_settings', '通知设置', '#settings/notifications', 'fa-bell', '', 45, 1, 1),
    ('settings', '系统设置', '#settings', 'fa-sliders', '', 50, 1, 1),
    ('menu_settings', '菜单管理', '#settings/menu', 'fa-list-check', 'settings', 51, 1, 1),
    ('ua_settings', 'User-Agent 设置', '#settings/ua', 'fa-mobile-screen', 'settings', 52, 1, 1);

-- A single anonymous sample keeps the dashboard populated after first deploy.
INSERT OR IGNORE INTO sites(id, site_name, url, type, timeout, enabled, check_interval, fail_threshold)
VALUES (1, '示例网站', 'https://example.com', 'http', 10, 1, 5, 3);

INSERT OR IGNORE INTO checks(id, site_id, status, response_time, http_code, message, request_data, response_data)
VALUES (
    1,
    1,
    1,
    120,
    200,
    '检测成功（演示数据）',
    '{"method":"GET","url":"https://example.com","headers":{"User-Agent":"CoolMonitor/1.1"},"body":""}',
    '{"status":200,"status_text":"OK","headers":{"content-type":"text/html"},"body":"Sample response omitted."}'
);
