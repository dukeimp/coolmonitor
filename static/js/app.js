// === CoolMonitor SPA ===
var API_BASE = window.COOLMONITOR_API_BASE || window.location.origin;
var chart = null;
var currentUser = null;
var registrationAllowed=false;
var ROLE_NAMES={admin:"管理员",user:"普通用户",visitor:"访问者"};
var ROLE_DEFAULTS={admin:["dashboard.view","sites.view","sites.create","sites.edit","sites.delete","sites.check","logs.view","logs.delete","settings.view","settings.edit","notifications.view","notifications.edit","users.view","users.create","users.edit","users.delete","users.permissions"],user:["dashboard.view","sites.view","sites.create","sites.edit","sites.check","logs.view"],visitor:["dashboard.view","sites.view","logs.view"]};
var PERMISSION_LABELS={"dashboard.view":"查看仪表盘","sites.view":"查看监控","sites.create":"新增监控","sites.edit":"编辑监控","sites.delete":"删除监控","sites.check":"立即检测","logs.view":"查看日志","logs.delete":"删除日志","settings.view":"查看系统设置","settings.edit":"修改系统设置","notifications.view":"查看通知设置","notifications.edit":"修改通知设置","users.view":"查看用户","users.create":"新增用户","users.edit":"编辑用户","users.delete":"删除用户","users.permissions":"分配权限"};
var uaProfiles=[{id:"coolmonitor",name:"CoolMonitor 默认",value:"CoolMonitor/1.1"}],_editingUaId=null,_uaPage=0,_uaPageSize=10;
var MENU_DEFAULTS={dashboard:"仪表盘",admin:"监控管理",logs:"监控日志",users:"用户管理",settings:"系统设置",notification_settings:"通知设置",menu_settings:"菜单管理",ua_settings:"User-Agent 设置"},menuLabels={...MENU_DEFAULTS},customMenus=[],_editingCustomMenuId=null;
var DEFAULT_NOTIFY_TEMPLATE={failure_title:"🚨 {{site_name}} 监控告警",failure_body:"🚨 监控告警\n\n监控名称：{{site_name}}\n当前状态：离线\n故障原因：{{message}}\n连续失败：{{fail_count}} 次\n响应时间：{{response_time}} ms\n监控地址：{{url}}\n发生时间：{{occurred_at}}",recovery_title:"✅ {{site_name}} 服务恢复",recovery_body:"✅ 服务恢复\n\n监控名称：{{site_name}}\n当前状态：运行正常\n故障持续：{{duration}}\n响应时间：{{response_time}} ms\n恢复时间：{{recovered_at}}"};

// --- Token ---
function getToken(){return localStorage.getItem("token")}
function setToken(t){localStorage.setItem("token",t)}
function clearToken(){localStorage.removeItem("token")}

// --- Page switch ---
function showPage(id){document.querySelectorAll(".page").forEach(function(p){p.classList.remove("active")});document.getElementById(id).classList.add("active")}
function showLoginPage(){showPage("loginPage")}
function showRegister(){if(registrationAllowed)showPage("registerPage");else{showNotification("error","系统已有管理员，公开注册已关闭");showLoginPage()}}
async function loadRegistrationStatus(){try{var r=await fetch(API_BASE+"/api/register-status"),d=await r.json();registrationAllowed=!!d.registration_allowed}catch(e){registrationAllowed=false}var entry=document.getElementById("registerEntry");if(entry)entry.style.display=registrationAllowed?"block":"none";if(!registrationAllowed&&document.getElementById("registerPage").classList.contains("active"))showLoginPage()}

// --- Tab switch ---
function switchTab(tab){
  if(tab!=="settings")hideSettingsSubmenu();
  var target=document.querySelector(".nav-item[data-tab='"+tab+"']");
  if(!target||target.style.display==="none")return;
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(n){n.classList.remove("active")});
  document.querySelector(".nav-item[data-tab='"+tab+"']").classList.add("active");
  document.querySelectorAll(".tab-content").forEach(function(t){t.classList.remove("active")});
  document.getElementById(tab+"Tab").classList.add("active");
  if(tab==="admin")loadAdmin();
  if(tab==="logs")loadLogs();
  if(tab==="users")loadUsers();
  if(tab==="settings"){loadSettings();if(!document.querySelector(".settings-panel.active"))showSettingsPanel("retention")}
  if(tab==="dashboard")loadDashboard()
}
function openSettingsPanel(panel){
  showSettingsSubmenu();
  switchTab("settings");
  showSettingsPanel(panel)
}
function showSettingsSubmenu(){var menu=document.querySelector(".sidebar-submenu"),parent=document.querySelector(".settings-parent");if(menu)menu.classList.add("show");if(parent)parent.classList.add("expanded")}
function hideSettingsSubmenu(){var menu=document.querySelector(".sidebar-submenu"),parent=document.querySelector(".settings-parent");if(menu)menu.classList.remove("show");if(parent)parent.classList.remove("expanded")}
function toggleSettingsSubmenu(){var menu=document.querySelector(".sidebar-submenu");if(!menu)return;menu.classList.contains("show")?hideSettingsSubmenu():showSettingsSubmenu()}
function showSettingsPanel(panel){
  document.querySelectorAll(".settings-panel").forEach(function(el){el.classList.remove("active")});
  document.querySelectorAll(".submenu-item").forEach(function(el){el.classList.toggle("active",el.dataset.settingsPanel===panel)});
  var panelIds={notifications:"notificationSettingsPanel",menu:"menuSettingsPanel",ua:"uaSettingsPanel",retention:"retentionSettingsPanel"};var target=document.getElementById(panelIds[panel]||panelIds.retention);if(target)target.classList.add("active")
}
function hasPermission(p){return !!currentUser&&(currentUser.role==="admin"||(currentUser.permissions||[]).includes(p))}
function applyPermissionVisibility(){document.querySelectorAll("[data-permission]").forEach(function(el){el.style.display=hasPermission(el.dataset.permission)?"":"none"})}
function applyAccess(user){
  currentUser=user||null;
  if(!user)return;
  document.getElementById("topbarUsername").innerText=user.display_name||user.username;
  var role=document.getElementById("topbarRole");role.innerText=ROLE_NAMES[user.role]||"访问者";role.className="role-pill "+user.role;
  applyPermissionVisibility();
  if(hasPermission("sites.view"))loadUaProfiles()
  loadMenuLabels()
}
async function loadMenuLabels(){try{var results=await Promise.all([apiFetch("/api/menu-labels"),apiFetch("/api/custom-menus")]);menuLabels={...MENU_DEFAULTS,...results[0]};customMenus=Array.isArray(results[1])?results[1]:[];applyMenuLabels();renderMenuNameGrid();renderCustomMenus()}catch(e){applyMenuLabels()}}
function applyMenuLabels(){document.querySelectorAll("[data-menu-label]").forEach(function(el){el.textContent=menuLabels[el.dataset.menuLabel]||MENU_DEFAULTS[el.dataset.menuLabel]||el.textContent})}
function renderMenuNameGrid(){var grid=document.getElementById("menuNameGrid");if(!grid)return;grid.innerHTML="";Object.keys(MENU_DEFAULTS).forEach(function(key){var label=document.createElement("label");label.innerHTML='<span>'+MENU_DEFAULTS[key]+'</span><input data-menu-name="'+key+'" value="'+escapeHtml(menuLabels[key]||MENU_DEFAULTS[key])+'" maxlength="20">';grid.appendChild(label)})}
async function saveMenuLabels(){var next={};document.querySelectorAll("[data-menu-name]").forEach(function(input){next[input.dataset.menuName]=input.value.trim()||MENU_DEFAULTS[input.dataset.menuName]});try{await apiFetch("/api/settings",{method:"POST",body:JSON.stringify({menu_labels:next})});menuLabels=next;applyMenuLabels();showNotification("success","菜单名称已保存")}catch(e){showNotification("error","菜单名称保存失败")}}
function openFlexibleMenu(url){hideSettingsSubmenu();if(url.startsWith("#settings/")){openSettingsPanel(url.split("/")[1]);return}if(/^#(dashboard|admin|logs|users)$/.test(url)){switchTab(url.slice(1));return}if(/^https?:\/\//i.test(url)){window.open(url,"_blank","noopener");return}if(url.startsWith("/"))window.location.href=url}
function renderCustomMenus(){
  var sidebar=document.getElementById("customMenuList"),table=document.getElementById("customMenuTable");if(sidebar)sidebar.innerHTML="";if(table)table.innerHTML="";
  customMenus.forEach(function(item){
    if(sidebar){var button=document.createElement("button");button.className="nav-item custom-nav-item";button.title=item.name;button.innerHTML='<i class="fas fa-link"></i><span>'+escapeHtml(item.name)+'</span>';button.onclick=function(){openFlexibleMenu(item.url)};sidebar.appendChild(button)}
    if(table){var row=document.createElement("div");row.className="ua-row";row.innerHTML='<div class="ua-device-icon"><i class="fas fa-link"></i></div><div class="ua-info"><strong>'+escapeHtml(item.name)+'</strong><code>'+escapeHtml(item.url)+'</code></div>';if(hasPermission("settings.edit")){var actions=document.createElement("div");actions.className="row-actions";var edit=document.createElement("button");edit.className="btn btn-secondary btn-sm";edit.innerHTML='<i class="fas fa-pen"></i>';edit.onclick=function(){editCustomMenu(item.id)};var del=document.createElement("button");del.className="btn btn-ghost-danger btn-sm";del.innerHTML='<i class="fas fa-trash"></i>';del.onclick=function(){deleteCustomMenu(item.id)};actions.append(edit,del);row.appendChild(actions)}table.appendChild(row)}
  })
}

// --- Notification ---
function showNotification(type,msg){
  var n=document.getElementById("notification");n.className="notification show "+type;
  n.querySelector(".notification-icon").className="notification-icon fas "+(type==="success"?"fa-check-circle":"fa-exclamation-circle");
  n.querySelector(".notification-message").innerText=msg;
  setTimeout(function(){n.classList.remove("show")},3000)
}

// --- API ---
async function apiFetch(p,o){
  o=o||{};var t=getToken(),h={"Content-Type":"application/json",...o.headers};
  if(t)h["Authorization"]="Bearer "+t;
  var r=await fetch(API_BASE+p,{...o,headers:h});
  if(!r.ok)throw new Error(r.status+" "+await r.text());
  return r.json()
}
async function getSites(){try{return await apiFetch("/api/sites")}catch{return[]}}
async function getStatus(){try{return await apiFetch("/api/status")}catch{return null}}
async function getHistoryAPI(i){try{return await apiFetch("/api/history?id="+i)}catch{return[]}}

async function createSite(d){return apiFetch("/api/sites",{method:"POST",body:JSON.stringify(d)})}
async function removeSite(i){return apiFetch("/api/sites",{method:"POST",body:JSON.stringify({action:"delete",id:i})})}
async function editSite(d){return apiFetch("/api/sites",{method:"POST",body:JSON.stringify({action:"edit",...d})})}

async function runCheckAPI(id){return apiFetch("/api/check",{method:"POST",body:JSON.stringify({id:id})})}
async function getLogsAPI(params){try{var s="?"+new URLSearchParams(params);return await apiFetch("/api/logs"+s)}catch{return {total:0,rows:[]}}}
async function getLogDetailAPI(id){return apiFetch("/api/log-detail?id="+id)}
async function loadUaProfiles(){try{uaProfiles=await apiFetch("/api/user-agents");populateUaSelect("add");populateUaSelect("edit");renderUaDictionary()}catch(e){}}
function populateUaSelect(prefix,selected){
  var select=document.getElementById(prefix+"UserAgent");if(!select)return;
  select.innerHTML="";uaProfiles.forEach(function(item){var o=document.createElement("option");o.value=item.value;o.textContent=item.name;select.appendChild(o)});
  if(selected&&!uaProfiles.some(function(item){return item.value===selected})){var custom=document.createElement("option");custom.value=selected;custom.textContent="当前自定义";select.appendChild(custom)}
  select.value=selected||uaProfiles[0]?.value||"CoolMonitor/1.1";select.onchange=function(){renderRequestPacketPreview(prefix)}
}

// --- Login ---
function setSidebarCollapsed(collapsed){
  document.body.classList.toggle("sidebar-collapsed",collapsed);
  var button=document.getElementById("sidebarToggle");if(!button)return;
  button.title=collapsed?"展开菜单":"收起菜单";button.setAttribute("aria-label",button.title);button.setAttribute("aria-expanded",String(!collapsed));
  var icon=button.querySelector("i");if(icon)icon.className=collapsed?"fas fa-angles-right":"fas fa-angles-left";
  if(collapsed)hideSettingsSubmenu();
}
function toggleSidebar(){var collapsed=!document.body.classList.contains("sidebar-collapsed");setSidebarCollapsed(collapsed);try{localStorage.setItem("coolmonitor_sidebar_collapsed",collapsed?"1":"0")}catch(e){}}
document.addEventListener("DOMContentLoaded",function(){
  document.querySelectorAll(".sidebar .nav-item").forEach(function(item){var label=item.querySelector("span");if(label)item.title=label.textContent.trim()});
  try{setSidebarCollapsed(localStorage.getItem("coolmonitor_sidebar_collapsed")==="1")}catch(e){setSidebarCollapsed(false)}
  document.getElementById("sidebarToggle").addEventListener("click",toggleSidebar);
  document.getElementById("loginForm").addEventListener("submit",async function(e){
    e.preventDefault();var u=document.getElementById("username").value,pw=document.getElementById("password").value,err=document.getElementById("loginError");
    try{
      var btn=e.target.querySelector("button");btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 登录中...';btn.disabled=true;
      var r=await fetch(API_BASE+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:pw})}),d=await r.json();
      if(d.success){setToken(d.token);applyAccess(d.user);showPage("mainPage");switchTab("dashboard");loadDashboard()}else{err.textContent=d.message;err.classList.add("show")}
    }catch(e){err.textContent="登录失败";err.classList.add("show")}
    finally{var b=document.getElementById("loginForm").querySelector("button");b.innerHTML='<i class="fas fa-sign-in-alt"></i> 登录';b.disabled=false}
  });
  document.getElementById("registerForm").addEventListener("submit",async function(e){
    e.preventDefault();var u=document.getElementById("regUser").value,pw=document.getElementById("regPass").value,err=document.getElementById("regError");
    try{
      var r=await fetch(API_BASE+"/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:pw})}),d=await r.json();
      if(d.success){registrationAllowed=false;document.getElementById("registerEntry").style.display="none";showNotification("success","管理员注册成功，请登录");showLoginPage()}else{err.textContent=d.message;err.classList.add("show")}
    }catch(e){err.textContent="注册失败";err.classList.add("show")}
  });
  // Tab nav click
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(n){
    n.addEventListener("click",function(){if(this.dataset.tab==="settings")toggleSettingsSubmenu();else switchTab(this.dataset.tab)})
  });
  // Avatar dropdown toggle
  document.getElementById("userAvatar").addEventListener("click",function(e){
    e.stopPropagation();document.getElementById("userDropdown").classList.toggle("show")
  });
  document.addEventListener("click",function(){document.getElementById("userDropdown").classList.remove("show")});
  // Logout
  document.getElementById("logoutBtn").addEventListener("click",function(){
    fetch(API_BASE+"/api/logout",{method:"POST",headers:{Authorization:"Bearer "+getToken()}}).catch(function(){});
    clearToken();showLoginPage()
  });
  loadRegistrationStatus();
  // Auto-auth check
  var tok=getToken();if(tok){
    try{fetch(API_BASE+"/api/auth",{headers:{Authorization:"Bearer "+tok}}).then(function(r){return r.json()}).then(function(d){if(d.success){applyAccess(d.user);showPage("mainPage");switchTab(hasPermission("dashboard.view")?"dashboard":"logs")}else{clearToken();showLoginPage()}})}catch(e){};
  }else showLoginPage()
});

// --- Dashboard ---
async function loadDashboard(){
  var s=await getStatus();
  if(s){document.getElementById("total").innerText=s.total||0;document.getElementById("online").innerText=s.online||0;document.getElementById("offline").innerText=s.offline||0;document.getElementById("uptime").innerText=(s.uptime||0)+"%";document.getElementById("avgResponse").innerText=(s.avg_response||0)+" ms"}
  await loadDashboardInsights();
  loadAdmin();
  loadDashCharts()
}
var _dashboardRange="24h",_refreshSeconds=30;
function setDashboardRange(range){_dashboardRange=range;document.querySelectorAll("[data-range]").forEach(function(btn){btn.classList.toggle("active",btn.dataset.range===range)});loadDashboardInsights()}
async function loadDashboardInsights(){
  try{var d=await apiFetch("/api/dashboard?range="+_dashboardRange);document.getElementById("p95Response").innerText=(d.p95_response||0)+" ms";document.getElementById("rangeChecks").innerText=d.checks||0;document.getElementById("dashboardUpdated").innerText="最后更新："+new Date().toLocaleTimeString()+" · 成功率 "+(d.success_rate||0)+"% · 最高响应 "+(d.max_response||0)+"ms";renderDashboardStatusOverview(d.status_events||[]);_refreshSeconds=30}catch(e){}
}
function showStatusTooltip(point,text){var tip=document.getElementById("statusFloatingTooltip");if(!tip){tip=document.createElement("div");tip.id="statusFloatingTooltip";tip.className="status-floating-tooltip";document.body.appendChild(tip)}tip.textContent=text;tip.classList.add("show");var rect=point.getBoundingClientRect(),tipRect=tip.getBoundingClientRect(),top=rect.top-tipRect.height-9;if(top<8)top=rect.bottom+9;var left=Math.max(8,Math.min(window.innerWidth-tipRect.width-8,rect.left+rect.width/2-tipRect.width/2));tip.style.left=left+"px";tip.style.top=top+"px"}
function hideStatusTooltip(){var tip=document.getElementById("statusFloatingTooltip");if(tip)tip.classList.remove("show")}
function renderDashboardStatusOverview(rows){var box=document.getElementById("dashboardStatusOverview");box.innerHTML="";if(!rows.length){box.innerHTML='<div class="empty-state"><i class="fas fa-clock"></i><span>当前时间范围暂无检测记录</span></div>';return}var groups={};rows.forEach(function(row){(groups[row.site_id]||(groups[row.site_id]={name:row.site_name,rows:[]})).rows.push(row)});Object.keys(groups).forEach(function(key){var group=groups[key],line=document.createElement("div"),track=document.createElement("div");line.className="status-track-row";track.className="status-points";var name=document.createElement("strong");name.textContent=group.name;line.appendChild(name);group.rows.forEach(function(row){var message=String(row.message||""),isTimeout=row.status!=1&&/(超时|timeout|timed out|abort)/i.test(message),state=row.status==1?"ok":(isTimeout?"timeout":"fail"),stateName=row.status==1?"正常":(isTimeout?"超时":"异常"),tooltip=row.created_at+" · "+stateName+" · "+(row.response_time||0)+"ms",point=document.createElement("span");point.className="status-point "+state;point.setAttribute("aria-label",tooltip);point.onmouseenter=function(){showStatusTooltip(point,tooltip)};point.onmouseleave=hideStatusTooltip;track.appendChild(point)});line.appendChild(track);box.appendChild(line)})}
var _dashChart = null;
var _dashColors = ["#667eea","#48bb78","#f56565","#ed8936","#4299e1","#9f7aea","#f687b3","#38b2ac","#d53f8c","#00b5d8","#6c63ff","#20c997"];

async function loadDashCharts(){
  if(typeof Chart==="undefined"){setTimeout(loadDashCharts,500);return}
  var sites = await getSites();
  if(!sites || !sites.length)return;
  var datasets = [];
  var allLabels = new Set();
  var siteHistories = [];
  for(var si=0; si<sites.length; si++){
    var site = sites[si];
    var hist = await getHistoryAPI(site.id);
    if(!hist || !hist.length)continue;
    hist = hist.slice().reverse();
    var labels = hist.map(function(x){return formatTime(x.created_at)});
    var vals = hist.map(function(x){return x.response_time});
    labels.forEach(function(l){allLabels.add(l)});
    siteHistories.push({name: site.site_name, labels: labels, vals: vals, id: site.id})
  }
  if(!siteHistories.length)return;
  // Build chart datasets
  var colorIdx = 0;
  siteHistories.forEach(function(sh){
    datasets.push({
      label: sh.name,
      data: sh.vals,
      tension: 0.3,
      borderColor: _dashColors[colorIdx % _dashColors.length],
      backgroundColor: _dashColors[colorIdx % _dashColors.length].replace(")",",0.1)").replace("rgb","rgba"),
      fill: false,
      pointRadius: 2,
      pointHoverRadius: 4
    });
    colorIdx++
  });
  var ctx = document.getElementById("dashResponseChart");
  if(!ctx)return;
  if(_dashChart)_dashChart.destroy();
  _dashChart = new Chart(ctx, {
    type: "line",
    data: {labels: siteHistories[0].labels, datasets: datasets},
    options: {
      responsive: true,
      interaction: {mode: "index", intersect: false},
      plugins: {
        legend: {position: "top", labels: {boxWidth: 12, padding: 12, font: {size: 11}}}
      },
      scales: {
        x: {ticks: {maxTicksLimit: 12, font: {size: 10}}, grid: {display: false}},
        y: {beginAtZero: true, ticks: {font: {size: 10}}, grid: {color: "rgba(0,0,0,0.06)"}}
      }
    }
  });
  // Status bar - per site row
  var barContainer = document.getElementById("dashStatusBar");
  if(!barContainer)return;
  barContainer.innerHTML = "";
  var statusColors = _dashColors.slice();
  siteHistories.forEach(function(sh, idx){
    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";
    var label = document.createElement("span");
    label.style.cssText = "font-size:0.75rem;font-weight:600;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);";
    label.innerText = sh.name;
    row.appendChild(label);
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;flex:1;";
    // We need full history for status - re-fetch from API
    (function(siteId, rowEl){
      getHistoryAPI(siteId).then(function(h){
        if(!h || !h.length)return;
        h.slice(0,200).forEach(function(item){
          var dot = document.createElement("span");
          dot.style.cssText = "width:10px;height:28px;border-radius:3px;background:"+(item.status==1?"#22c55e":"#ef4444")+";";
          dot.title = item.created_at + " " + (item.status==1?"在线":"失败");
          bar.appendChild(dot)
        });
        rowEl.appendChild(bar)
      })
    })(sh.id, row);
    if(!bar.parentNode)row.appendChild(bar);

    barContainer.appendChild(row)
  })
}
async function manualCheckSite(id){var site=_allSites.find(function(item){return item.id==id}),name=site?site.site_name:"该监控";try{showNotification("success",name+" 正在检测...");await runCheckAPI(id);showNotification("success",name+" 检测完成");await loadAdmin();loadDashboard()}catch(e){showNotification("error",e.message||name+" 检测失败")}}
setInterval(function(){if(!document.getElementById("mainPage").classList.contains("active"))return;_refreshSeconds--;var el=document.getElementById("refreshCountdown");if(el)el.innerText=Math.max(0,_refreshSeconds);if(_refreshSeconds<=0){_refreshSeconds=30;loadDashboard()}},1000)

// --- Admin ---
var _allSites=[],_adminPages=0,_adminPage=0,_adminPageSize=10,_adminQuery={};

async function loadAdmin(){
  _allSites=await getSites()||[];
  _adminPage=0;_adminQuery=collectAdminQuery();renderAdmin()
}
function collectAdminQuery(){return{name:(document.getElementById("searchName").value||"").trim().toLowerCase(),url:(document.getElementById("searchUrl").value||"").trim().toLowerCase(),type:document.getElementById("searchType").value||"",status:document.getElementById("searchStatus").value||"",freq:document.getElementById("searchFreq").value||""}}
function filterAdmin(){
  _adminQuery=collectAdminQuery();_adminPage=0;renderAdmin()
}
function changeAdminPageSize(){_adminPageSize=parseInt(document.getElementById("adminPageSize").value)||10;filterAdmin()}
function resetAdminFilter(){
  document.getElementById("searchName").value="";
  document.getElementById("searchUrl").value="";
  document.getElementById("searchType").value="";
  document.getElementById("searchStatus").value="";
  document.getElementById("searchFreq").value="";
  filterAdmin()
}
function renderAdmin(){
  var kwName=_adminQuery.name||"",kwUrl=_adminQuery.url||"",kwType=_adminQuery.type||"",kwStatus=_adminQuery.status||"",kwFreq=_adminQuery.freq||"";
  var filtered=_allSites.filter(function(site){
    if(kwName&&!site.site_name.toLowerCase().includes(kwName)) return false;
    if(kwUrl&&!site.url.toLowerCase().includes(kwUrl)) return false;
    if(kwType&&site.type!==kwType) return false;
    if(kwStatus!=""&&site.status!=parseInt(kwStatus)) return false;
    if(kwFreq&&(site.check_interval||1)!=parseInt(kwFreq)) return false;
    return true
  });
  var pages=Math.ceil(filtered.length/_adminPageSize)||1;_adminPages=pages;
  if(_adminPage>=pages)_adminPage=pages-1;
  if(_adminPage<0)_adminPage=0;
  var start=_adminPage*_adminPageSize,end=Math.min(start+_adminPageSize,filtered.length);
  var slice=filtered.slice(start,end);
  var list=document.getElementById("list");list.innerHTML="";
  slice.forEach(function(site){
    var st=site.status==1?"在线":"离线",sc=site.status==1?"status-online":"status-offline",ty=site.type||"http";
    var iv=site.check_interval||1;
    var tr=document.createElement("tr");
    var actions=(hasPermission("sites.check")?'<button class="btn btn-primary btn-sm" onclick="manualCheckSite('+site.id+')" title="立即检测"><i class="fas fa-bolt"></i></button>':'')+(hasPermission("sites.edit")?'<button class="btn btn-secondary btn-sm" onclick="openEditModal('+site.id+')" title="编辑"><i class="fas fa-pen"></i></button>':'')+(hasPermission("sites.delete")?'<button class="btn btn-danger btn-sm" onclick="deleteSite('+site.id+')" title="删除"><i class="fas fa-trash"></i></button>':'');
    tr.innerHTML='<td><div class="site-cell"><span class="site-icon"><i class="fas fa-globe"></i></span><strong>'+site.site_name+'</strong></div></td><td><a href="'+site.url+'" target="_blank" class="url-link">'+site.url+'</a></td><td><span class="tag">'+ty.toUpperCase()+'</span></td><td><span class="status '+sc+'">'+st+'</span></td><td>'+(site.response_time||0)+'ms</td><td>'+(site.fail_count||0)+'</td><td>'+iv+'分钟</td><td><div class="row-actions">'+actions+'</div></td>';
    list.appendChild(tr)
  });
  document.getElementById("adminPageInfo").innerText='第 '+(_adminPage+1)+'/'+pages+'页，共'+filtered.length+'条';
  document.getElementById("adminPrevBtn").disabled=_adminPage<=0;
  document.getElementById("adminNextBtn").disabled=_adminPage>=pages-1;
  document.getElementById("adminFirstBtn").disabled=_adminPage<=0;
  document.getElementById("adminLastBtn").disabled=_adminPage>=pages-1
}
function adminFirstPage(){if(_adminPage!==0){_adminPage=0;renderAdmin()}}
function adminPrevPage(){if(_adminPage>0){_adminPage--;renderAdmin()}}
function adminNextPage(){var pages=_adminPages;if(_adminPage<pages-1){_adminPage++;renderAdmin()}}
function adminLastPage(){if(_adminPage!==_adminPages-1){_adminPage=_adminPages-1;renderAdmin()}}

// --- Logs ---
var _logAllData=[],_logPages=0,_logPage=0,_logPageSize=10,_logTotal=0,_logQuery={};

async function loadLogs(){
  // Populate site dropdown
  var sites=await getSites()||[];
  var sel=document.getElementById("logSiteId");
  var curVal=sel.value;
  sel.innerHTML='<option value="">全部站点</option>';
  sites.forEach(function(s){sel.innerHTML+='<option value="'+s.id+'">'+s.site_name+'</option>'});
  sel.value=curVal;
  _logPage=0;_logQuery=collectLogQuery();renderLogs()
}
function collectLogQuery(){var q={},siteId=document.getElementById("logSiteId").value,status=document.getElementById("logStatus").value,kw=document.getElementById("logKeyword").value.trim(),dateFrom=document.getElementById("logDateFrom").value,dateTo=document.getElementById("logDateTo").value;if(siteId)q.site_id=siteId;if(status!=="")q.status=status;if(kw)q.keyword=kw;if(dateFrom)q.date_from=dateFrom;if(dateTo)q.date_to=dateTo;return q}
function filterLogs(){
  var dateFrom=document.getElementById("logDateFrom").value,dateTo=document.getElementById("logDateTo").value;if(dateFrom&&dateTo&&dateFrom>dateTo){showNotification("error","开始日期不能晚于结束日期");return}_logQuery=collectLogQuery();_logPage=0;renderLogs()
}
function changeLogPageSize(){_logPageSize=parseInt(document.getElementById("logPageSize").value)||10;filterLogs()}
function resetLogFilter(){
  document.getElementById("logSiteId").value="";
  document.getElementById("logStatus").value="";
  document.getElementById("logKeyword").value="";
  document.getElementById("logDateFrom").value="";
  document.getElementById("logDateTo").value="";
  filterLogs()
}
async function renderLogs(){
  var params={..._logQuery,limit:_logPageSize,offset:_logPage*_logPageSize};
  var data=await getLogsAPI(params);
  _logAllData=data.rows||[];
  _logTotal=data.total||0;_logPages=Math.ceil(_logTotal/_logPageSize)||1;
  if(_logPage>=_logPages)_logPage=_logPages-1;
  if(_logPage<0)_logPage=0;
  var list=document.getElementById("logList");list.innerHTML="";
  _logAllData.forEach(function(row){
    var tr=document.createElement("tr");
    tr.innerHTML='<td data-permission="logs.delete"><input class="log-select" type="checkbox" value="'+row.id+'" onchange="updateLogSelection()"></td><td>'+row.site_name+'</td><td><span class="status '+(row.status==1?"status-online":"status-offline")+'">'+(row.status==1?"在线":"失败")+'</span></td><td>'+(row.http_code||0)+'</td><td>'+(row.response_time||0)+'ms</td><td>'+(row.message||"")+'</td><td>'+row.created_at+'</td><td><div class="row-actions"><button class="btn btn-secondary btn-sm" onclick="openLogPacketModal('+row.id+')"><i class="fas fa-code"></i> 数据包</button><button class="btn btn-danger btn-sm" data-permission="logs.delete" onclick="deleteLog('+row.id+')"><i class="fas fa-trash"></i></button></div></td>';
    list.appendChild(tr)
  });
  applyPermissionVisibility();updateLogSelection();
  document.getElementById("logPageInfo").innerText='第 '+(_logPage+1)+'/'+_logPages+'页，共'+_logTotal+'条';updateLogSelection();
  document.getElementById("logPrevBtn").disabled=_logPage<=0;
  document.getElementById("logNextBtn").disabled=_logPage>=_logPages-1;
  document.getElementById("logFirstBtn").disabled=_logPage<=0;
  document.getElementById("logLastBtn").disabled=_logPage>=_logPages-1
}
function logFirstPage(){if(_logPage!==0){_logPage=0;renderLogs()}}
function logPrevPage(){if(_logPage>0){_logPage--;renderLogs()}}
function logNextPage(){if(_logPage<_logPages-1){_logPage++;renderLogs()}}
function logLastPage(){if(_logPage!==_logPages-1){_logPage=_logPages-1;renderLogs()}}
function toggleAllLogs(checked){document.querySelectorAll(".log-select").forEach(function(box){box.checked=checked});updateLogSelection()}
function updateLogSelection(){var boxes=[...document.querySelectorAll(".log-select")],selected=boxes.filter(function(box){return box.checked}),all=document.getElementById("logSelectAll"),button=document.getElementById("deleteLogsButton");if(all){all.checked=boxes.length>0&&selected.length===boxes.length;all.indeterminate=selected.length>0&&selected.length<boxes.length}if(button){button.disabled=selected.length===0&&_logTotal===0;button.title=selected.length?"删除选中的 "+selected.length+" 条日志":"删除当前查询的 "+_logTotal+" 条日志"}}
async function deleteLog(id){if(!confirm("确定删除这条监控日志及其请求、响应数据包吗？"))return;await deleteLogIds([id])}
async function deleteLogsBySelection(){var ids=[...document.querySelectorAll(".log-select:checked")].map(function(box){return Number(box.value)});if(ids.length){if(!confirm("确定删除选中的 "+ids.length+" 条监控日志及其请求、响应数据包吗？此操作不可恢复。"))return;return deleteLogIds(ids)}if(!_logTotal)return;var scope=Object.keys(_logQuery).length?"当前查询条件下的":"全部";if(!confirm("当前没有勾选日志，将删除"+scope+" "+_logTotal+" 条日志及其请求、响应数据包。确定继续吗？"))return;try{var result=await apiFetch("/api/logs",{method:"POST",body:JSON.stringify({action:"delete_filtered",filters:_logQuery})});showNotification("success","已删除 "+(result.deleted||_logTotal)+" 条日志");_logPage=0;renderLogs()}catch(e){showNotification("error",e.message||"日志删除失败")}}
async function deleteLogIds(ids){try{var result=await apiFetch("/api/logs",{method:"POST",body:JSON.stringify({ids:ids})});showNotification("success","已删除 "+(result.deleted||ids.length)+" 条日志");renderLogs()}catch(e){showNotification("error",e.message||"日志删除失败")}}
function openRetentionSettings(){switchTab("settings");hideSettingsSubmenu();showSettingsPanel("retention")}
async function openLogPacketModal(id){
  try{
    var d=await getLogDetailAPI(id);
    document.getElementById("packetMeta").innerHTML='<strong>'+d.site_name+'</strong><span>'+d.created_at+'</span><span>HTTP '+(d.http_code||0)+'</span><span>'+(d.response_time||0)+'ms</span>';
    document.getElementById("requestPacket").textContent=JSON.stringify(d.request_data||{},null,2);
    document.getElementById("responsePacket").textContent=JSON.stringify(d.response_data||{},null,2);
    document.getElementById("packetModal").classList.add("show")
  }catch(e){showNotification("error","数据包加载失败")}
}
function closePacketModal(){document.getElementById("packetModal").classList.remove("show")}
async function addSite(){
  var iv = getIntervalValue();
  var d={site_name:document.getElementById("site_name").value,url:document.getElementById("url").value,type:document.getElementById("type").value,keyword:document.getElementById("keyword").value,timeout:parseInt(document.getElementById("timeout").value)||10,check_interval:iv,fail_threshold:parseInt(document.getElementById("failThreshold").value)||1};
  if(!d.site_name||!d.url){showNotification("error","请输入名称和URL");return}
  try{await createSite(d);showNotification("success","添加成功");loadAdmin()}catch{showNotification("error","添加失败")}
}
async function deleteSite(i){if(confirm("确认删除该监控？历史日志和数据包将保留。")){try{var result=await removeSite(i);showNotification("success","监控已删除，已保留 "+(result.retained_logs||0)+" 条历史日志");loadAdmin()}catch{showNotification("error","删除失败")}}}


// --- Add Site Modal ---
function openAddModal(){
  populateUaSelect("add");
  document.getElementById("addUrl").value="";
  document.getElementById("addSiteName").value="";
  document.getElementById("addType").value="http";
  document.getElementById("addKeyword").value="";
  document.getElementById("addKeywordMode").value="exists";
  document.getElementById("addJsonPath").value="";
  document.getElementById("addExpectedValue").value="";
  document.getElementById("addRequestMethod").value="GET";
  document.getElementById("addRequestHeaders").value="";
  document.getElementById("addRequestBody").value="";
  document.getElementById("addRawPacket").value="";
  document.getElementById("addTimeout").value=10;
  document.getElementById("addIntervalPreset").value="1";
  document.getElementById("addCustomIntervalBox").style.display="none";
  document.getElementById("addFailThreshold").value=1;
  document.getElementById("addKeywordBox").style.display="none";
  updateTypeFields("add");onRequestMethodChange("add");
  document.getElementById("addModal").classList.add("show")
}
function closeAddModal(){
  document.getElementById("addModal").classList.remove("show")
}
function onAddTypeChange(){
  updateTypeFields("add")
}
var TYPE_HINTS={http:"HTTP：检查 2xx/3xx 状态码与响应时间",keyword:"关键词：检查页面源码是否包含指定文本",json:"JSON API：按 data.status 或 items[0].id 这类路径断言响应值",ssl:"SSL：必须使用 https:// ，验证证书有效性与 TLS 握手",tcp:"TCP 端口：检查 SSH、数据库等端口是否开放，例如 server.example.com:22"};
function updateTypeFields(prefix){
  var type=document.getElementById(prefix+"Type").value;
  document.getElementById(prefix+"KeywordBox").style.display=type==="keyword"?"block":"none";
  document.getElementById(prefix+"JsonBox").style.display=type==="json"?"flex":"none";
  document.getElementById(prefix+"RequestBox").style.display=(type==="tcp"||type==="ssl")?"none":"block";
  var url=document.getElementById(prefix+"Url");url.placeholder=type==="tcp"?"server.example.com:22":(type==="ssl"?"https://example.com":"https://api.example.com/health");
  document.querySelector("#"+prefix+"TypeHint span").innerText=TYPE_HINTS[type]||TYPE_HINTS.http
}
function onRequestMethodChange(prefix){var method=document.getElementById(prefix+"RequestMethod").value;document.getElementById(prefix+"RequestBodyBox").style.display=!['GET','HEAD'].includes(method)?"block":"none";renderRequestPacketPreview(prefix)}
function parseRawHttpPacket(raw){var normalized=String(raw||"").replace(/\r\n/g,"\n"),parts=normalized.split(/\n\s*\n/),head=parts.shift()||"",body=parts.join("\n\n"),lines=head.split("\n"),first=(lines.shift()||"").trim().match(/^([A-Z]+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/i);if(!first)throw new Error("请求首行格式错误，例如 GET /path HTTP/1.1");var method=first[1].toUpperCase(),target=first[2],headers={},lastName="";lines.forEach(function(line){if(/^\s/.test(line)&&lastName){headers[lastName]+=" "+line.trim();return}var index=line.indexOf(":");if(index<1)return;lastName=line.slice(0,index).trim();headers[lastName]=line.slice(index+1).trim()});var findHeader=function(name){var key=Object.keys(headers).find(function(k){return k.toLowerCase()===name});return key?headers[key]:""},host=findHeader("host");if(!/^https?:\/\//i.test(target)){if(!host)throw new Error("相对路径数据包必须包含 Host 请求头");var referer=findHeader("referer"),scheme="https:";try{if(referer)scheme=new URL(referer).protocol}catch(e){}target=scheme+"//"+host+(target.startsWith("/")?target:"/"+target)}var url=new URL(target).toString(),blocked=new Set(["host","connection","content-length","accept-encoding","transfer-encoding","upgrade","proxy-connection"]),cleanHeaders={},userAgent="";Object.keys(headers).forEach(function(key){var lower=key.toLowerCase();if(lower==="user-agent")userAgent=headers[key];else if(!blocked.has(lower))cleanHeaders[key]=headers[key]});return{method:method,url:url,headers:cleanHeaders,user_agent:userAgent,body:body}}
function applyRawHttpPacket(prefix){try{var parsed=parseRawHttpPacket(document.getElementById(prefix+"RawPacket").value),allowed=["GET","POST","PUT","PATCH","DELETE","HEAD"];if(!allowed.includes(parsed.method))throw new Error("暂不支持请求方法 "+parsed.method);document.getElementById(prefix+"Url").value=parsed.url;document.getElementById(prefix+"RequestMethod").value=parsed.method;document.getElementById(prefix+"RequestHeaders").value=JSON.stringify(parsed.headers,null,2);document.getElementById(prefix+"RequestBody").value=parsed.body;if(parsed.user_agent)populateUaSelect(prefix,parsed.user_agent);onRequestMethodChange(prefix);showNotification("success","数据包已解析并应用，请核对预览后保存")}catch(e){showNotification("error",e.message||"数据包解析失败")}}
function renderRequestPacketPreview(prefix){var preview=document.getElementById(prefix+"RequestPreview");if(!preview)return;try{var urlValue=document.getElementById(prefix+"Url").value.trim();if(!urlValue){preview.textContent="填写 URL 或粘贴数据包后显示预览";return}var url=new URL(urlValue),method=document.getElementById(prefix+"RequestMethod").value,headers={};try{headers=JSON.parse(document.getElementById(prefix+"RequestHeaders").value||"{}")}catch(e){preview.textContent="请求头 JSON 格式错误";return}var ua=document.getElementById(prefix+"UserAgent").value;if(ua)headers={"User-Agent":ua,...headers};var lines=[method+" "+url.pathname+url.search+" HTTP/1.1","Host: "+url.host];Object.keys(headers).forEach(function(key){lines.push(key+": "+headers[key])});var body=document.getElementById(prefix+"RequestBody").value;if(!["GET","HEAD"].includes(method)&&body)lines.push("",body);preview.textContent=lines.join("\n")}catch(e){preview.textContent="URL 格式错误"}}
function validHeaders(raw){if(!raw.trim())return true;try{var value=JSON.parse(raw);return value&&typeof value==="object"&&!Array.isArray(value)}catch(e){return false}}
function onAddIntervalPresetChange(){
  document.getElementById("addCustomIntervalBox").style.display=document.getElementById("addIntervalPreset").value==="custom"?"block":"none"
}
function getAddIntervalValue(){
  var sel=document.getElementById("addIntervalPreset");
  if(sel.value==="custom") return parseInt(document.getElementById("addCustomInterval").value)||5;
  return parseInt(sel.value)||1;
}
async function submitAddSite(){
  var iv=getAddIntervalValue();
  var d={site_name:document.getElementById("addSiteName").value,
    url:document.getElementById("addUrl").value,
    type:document.getElementById("addType").value,
    keyword:document.getElementById("addKeyword").value,
    keyword_mode:document.getElementById("addKeywordMode").value,
    json_path:document.getElementById("addJsonPath").value.trim(),
    expected_value:document.getElementById("addExpectedValue").value,
    request_method:document.getElementById("addRequestMethod").value,
    request_headers:document.getElementById("addRequestHeaders").value.trim(),
    request_body:document.getElementById("addRequestBody").value,
    user_agent:document.getElementById("addUserAgent").value,
    timeout:parseInt(document.getElementById("addTimeout").value)||10,
    check_interval:iv,
    fail_threshold:parseInt(document.getElementById("addFailThreshold").value)||1};
  if(!d.url||!d.site_name){showNotification("error","请输入URL和名称");return}
  if(d.type==="ssl"&&!/^https:\/\//i.test(d.url)){showNotification("error","SSL 检测地址必须以 https:// 开头");return}
  if(d.type==="tcp"&&!/^[^:]+:\d+$/.test(d.url.replace(/^tcp:\/\//i,""))){showNotification("error","TCP 地址请使用 host:port 格式");return}
  if(d.type==="json"&&!d.json_path){showNotification("error","请输入 JSON 字段路径");return}
  if(d.type==="keyword"&&!d.keyword){showNotification("error","请输入要检测的关键词");return}
  if(!validHeaders(d.request_headers)){showNotification("error","请求头必须是有效的 JSON 对象");return}
  try{await createSite(d);showNotification("success","添加成功");closeAddModal();loadAdmin()}catch{showNotification("error","添加失败")}
}

var _editId=null;

var _detailId=null,_detailData=[],_detailPage=0,_detailPageSize=10;

function openDetailModal(id){
  getSites().then(function(sites){
    var site=sites.find(function(s){return s.id==id});
    if(!site)return;
    _detailId=id;
    document.getElementById("detailName").innerText=site.site_name;
    document.getElementById("detailModal").classList.add("show");
    loadDetailHistory()
  })
}
function closeDetailModal(){
  document.getElementById("detailModal").classList.remove("show");
  _detailId=null;_detailData=[]
}
async function loadDetailHistory(){
  if(!_detailId)return;
  _detailData=await getHistoryAPI(_detailId);
  _detailPage=0;
  renderDetailPage()
}
function renderDetailPage(){
  var total=_detailData.length,pages=Math.ceil(total/_detailPageSize)||1;
  if(_detailPage>=pages)_detailPage=pages-1;
  if(_detailPage<0)_detailPage=0;
  var start=_detailPage*_detailPageSize,end=Math.min(start+_detailPageSize,total);
  var slice=_detailData.slice(start,end);
  var body=document.getElementById("detailHistoryBody");body.innerHTML="";
  slice.forEach(function(row){
    var tr=document.createElement("tr");
    tr.innerHTML='<td>'+row.created_at+'</td><td><span class="status '+(row.status==1?"status-online":"status-offline")+'">'+(row.status==1?"在线":"失败")+'</span></td><td>'+(row.http_code||0)+'</td><td>'+(row.response_time||0)+'ms</td><td>'+(row.message||"")+'</td>';
    body.appendChild(tr)
  });
  document.getElementById("detailPageInfo").innerText='第 '+(_detailPage+1)+'/'+pages+'页，共'+total+'条';
  document.getElementById("detailPrevBtn").disabled=_detailPage<=0;
  document.getElementById("detailNextBtn").disabled=_detailPage>=pages-1
}
function detailPrevPage(){if(_detailPage>0){_detailPage--;renderDetailPage()}}
function detailNextPage(){var pages=Math.ceil(_detailData.length/_detailPageSize)||1;if(_detailPage<pages-1){_detailPage++;renderDetailPage()}}

function setEditIntervalPreset(val){
  var presetMap={1:true,30:true,360:true,1440:true};
  var sel=document.getElementById("editIntervalPreset");
  var custBox=document.getElementById("editCustomIntervalBox");
  if(presetMap[val]){sel.value=String(val);custBox.style.display="none"}
  else{sel.value="custom";custBox.style.display="block";document.getElementById("editCustomInterval").value=val}
}
function openEditModal(id){
  getSites().then(function(sites){
    var site=sites.find(function(s){return s.id==id});
    if(!site)return;
    _editId=id;
    document.getElementById("editSiteName").value=site.site_name;
    document.getElementById("editUrl").value=site.url;
    document.getElementById("editType").value=site.type||"http";
    document.getElementById("editKeyword").value=site.keyword||"";
    document.getElementById("editKeywordMode").value=site.keyword_mode||"exists";
    document.getElementById("editJsonPath").value=site.json_path||"";
    document.getElementById("editExpectedValue").value=site.expected_value||"";
    document.getElementById("editRequestMethod").value=site.request_method||"GET";
    document.getElementById("editRequestHeaders").value=site.request_headers||"";
    document.getElementById("editRequestBody").value=site.request_body||"";
    document.getElementById("editRawPacket").value="";
    populateUaSelect("edit",site.user_agent||"CoolMonitor/1.1");
    onRequestMethodChange("edit");
    document.getElementById("editTimeout").value=site.timeout||10;
    setEditIntervalPreset(site.check_interval||1);
    document.getElementById("editFailThreshold").value=site.fail_threshold||1;
    updateTypeFields("edit");
    document.getElementById("editModal").classList.add("show")
  })
}
function closeEditModal(){
  document.getElementById("editModal").classList.remove("show");
  _editId=null
}
// 类型切换
async function submitEditSite(){
  var iv=getEditIntervalValue();
  var d={id:_editId,
    site_name:document.getElementById("editSiteName").value,
    url:document.getElementById("editUrl").value,
    type:document.getElementById("editType").value,
    keyword:document.getElementById("editKeyword").value,
    keyword_mode:document.getElementById("editKeywordMode").value,
    json_path:document.getElementById("editJsonPath").value.trim(),
    expected_value:document.getElementById("editExpectedValue").value,
    request_method:document.getElementById("editRequestMethod").value,
    request_headers:document.getElementById("editRequestHeaders").value.trim(),
    request_body:document.getElementById("editRequestBody").value,
    user_agent:document.getElementById("editUserAgent").value,
    timeout:parseInt(document.getElementById("editTimeout").value)||10,
    check_interval:iv,
    fail_threshold:parseInt(document.getElementById("editFailThreshold").value)||1
  };
  if(!d.site_name||!d.url){showNotification("error","请输入名称和URL");return}
  if(d.type==="ssl"&&!/^https:\/\//i.test(d.url)){showNotification("error","SSL 检测地址必须以 https:// 开头");return}
  if(d.type==="tcp"&&!/^[^:]+:\d+$/.test(d.url.replace(/^tcp:\/\//i,""))){showNotification("error","TCP 地址请使用 host:port 格式");return}
  if(d.type==="json"&&!d.json_path){showNotification("error","请输入 JSON 字段路径");return}
  if(d.type==="keyword"&&!d.keyword){showNotification("error","请输入要检测的关键词");return}
  if(!validHeaders(d.request_headers)){showNotification("error","请求头必须是有效的 JSON 对象");return}
  try{await editSite(d);showNotification("success","保存成功");closeEditModal();loadAdmin();loadDashboard()}catch{showNotification("error","保存失败")}
}

function getIntervalValue(){
  var sel=document.getElementById("intervalPreset");
  if(sel.value==="custom") return parseInt(document.getElementById("customInterval").value)||5;
  return parseInt(sel.value)||1;
}
function getEditIntervalValue(){
  var sel=document.getElementById("editIntervalPreset");
  if(sel.value==="custom") return parseInt(document.getElementById("editCustomInterval").value)||5;
  return parseInt(sel.value)||1;
}
function onIntervalPresetChange(){
  var sel=document.getElementById("intervalPreset");
  document.getElementById("customIntervalBox").style.display=sel.value==="custom"?"block":"none"
}
function onEditIntervalPresetChange(){
  var sel=document.getElementById("editIntervalPreset");
  document.getElementById("editCustomIntervalBox").style.display=sel.value==="custom"?"block":"none"
}
function onEditTypeChange(){
  updateTypeFields("edit")
}

async function changePassword(){
  var o=document.getElementById("oldPassword").value,n=document.getElementById("newPassword").value,m=document.getElementById("pwdMsg");
  if(!o||!n){m.innerText="请填写完整";m.style.color="#f56565";return}
  if(n.length<6){m.innerText="密码不能少于6位";m.style.color="#f56565";return}
  try{var d=await apiFetch("/api/change-password",{method:"POST",body:JSON.stringify({oldPassword:o,newPassword:n})});m.innerText=d.message;m.style.color=d.success?"#48bb78":"#f56565";if(d.success){document.getElementById("oldPassword").value="";document.getElementById("newPassword").value=""}}catch{m.innerText="修改失败"}
}


function formatTime(t){if(!t)return"-";return t.substring(5,16)}
// --- 修改密码弹窗 ---
document.getElementById("changePwdBtn").addEventListener("click",function(){
  document.getElementById("pwdModal").classList.add("show")
});
function closePwdModal(){
  document.getElementById("pwdModal").classList.remove("show");
  document.getElementById("modalOldPwd").value="";
  document.getElementById("modalNewPwd").value=""
}
async function submitChangePwd(){
  var o=document.getElementById("modalOldPwd").value,n=document.getElementById("modalNewPwd").value;
  if(!o||!n){showNotification("error","请填写完整");return}
  if(n.length<6){showNotification("error","密码不能少于6位");return}
  try{
    var d=await apiFetch("/api/change-password",{method:"POST",body:JSON.stringify({oldPassword:o,newPassword:n})});
    if(d.success){showNotification("success","密码修改成功");closePwdModal()}else showNotification("error",d.message)
  }catch{showNotification("error","原密码错误")}
}

// --- Users & permissions ---
var _users=[],_editingUserId=null;
async function loadUsers(){
  if(!hasPermission("users.view"))return;
  try{_users=await apiFetch("/api/users");renderUsers()}catch(e){showNotification("error","用户列表加载失败")}
}
function renderUsers(){
  var body=document.getElementById("userList");body.innerHTML="";
  _users.forEach(function(u){
    var tr=document.createElement("tr");
    var avatar=(u.display_name||u.username||"U").substring(0,1).toUpperCase();
    var actions=(hasPermission("users.edit")?'<button class="btn btn-secondary btn-sm" onclick="openUserModal('+u.id+')"><i class="fas fa-pen"></i> 编辑</button>':'')+(hasPermission("users.delete")&&(!currentUser||u.id!==currentUser.id)?'<button class="btn btn-ghost-danger btn-sm" onclick="deleteUser('+u.id+')"><i class="fas fa-trash"></i></button>':'');
    tr.innerHTML='<td><div class="user-cell"><span class="user-mini-avatar">'+avatar+'</span><div><strong>'+(u.display_name||u.username)+'</strong><small>@'+u.username+'</small></div></div></td><td><span class="role-pill '+u.role+'">'+(ROLE_NAMES[u.role]||u.role)+'</span></td><td><span class="permission-count">'+(u.permissions||[]).length+' 项</span></td><td><span class="account-state '+(u.enabled?'enabled':'disabled')+'">'+(u.enabled?'已启用':'已停用')+'</span></td><td>'+(u.created_at||'-')+'</td><td><div class="row-actions">'+actions+'</div></td>';
    body.appendChild(tr)
  })
}
function renderPermissionGrid(selected){
  var grid=document.getElementById("permissionGrid");grid.innerHTML="";
  Object.keys(PERMISSION_LABELS).forEach(function(p){
    var label=document.createElement("label");label.className="permission-option";
    label.innerHTML='<input type="checkbox" value="'+p+'" '+(selected.includes(p)?'checked':'')+'><span><i class="fas fa-check"></i></span><em>'+PERMISSION_LABELS[p]+'</em>';
    grid.appendChild(label)
  });
  var disabled=document.getElementById("userRole").value==="admin"||!hasPermission("users.permissions");
  grid.querySelectorAll("input").forEach(function(i){i.disabled=disabled})
}
function applyRolePreset(){renderPermissionGrid(ROLE_DEFAULTS[document.getElementById("userRole").value]||[])}
function toggleAllPermissions(on){if(!hasPermission("users.permissions"))return;document.querySelectorAll("#permissionGrid input:not(:disabled)").forEach(function(i){i.checked=on})}
function openUserModal(id){
  _editingUserId=id||null;var u=id?_users.find(function(x){return x.id==id}):null;
  document.getElementById("userModalTitle").innerText=u?"编辑用户":"新增用户";
  document.getElementById("userUsername").value=u?u.username:"";
  document.getElementById("userDisplayName").value=u?(u.display_name||""):"";
  document.getElementById("userPassword").value="";
  document.getElementById("userRole").value=u?u.role:"visitor";
  document.getElementById("userEnabled").checked=u?u.enabled:true;
  renderPermissionGrid(u?(u.permissions||[]):ROLE_DEFAULTS.visitor);
  document.getElementById("userModal").classList.add("show")
}
function closeUserModal(){document.getElementById("userModal").classList.remove("show");_editingUserId=null}
async function submitUser(){
  var data={action:_editingUserId?"edit":"create",id:_editingUserId,username:document.getElementById("userUsername").value.trim(),display_name:document.getElementById("userDisplayName").value.trim(),password:document.getElementById("userPassword").value,role:document.getElementById("userRole").value,enabled:document.getElementById("userEnabled").checked,permissions:Array.from(document.querySelectorAll("#permissionGrid input:checked")).map(function(i){return i.value})};
  if(!data.username||(!data.id&&data.password.length<6)){showNotification("error","请填写用户名，新用户密码至少6位");return}
  try{var r=await apiFetch("/api/users",{method:"POST",body:JSON.stringify(data)});if(r.success){showNotification("success","用户已保存");closeUserModal();loadUsers()}else showNotification("error",r.message||"保存失败")}catch(e){showNotification("error","保存失败")}
}
async function deleteUser(id){
  if(!confirm("确认删除该用户？"))return;
  try{var r=await apiFetch("/api/users",{method:"POST",body:JSON.stringify({action:"delete",id:id})});if(r.success){showNotification("success","用户已删除");loadUsers()}else showNotification("error",r.message)}catch(e){showNotification("error","删除失败")}
}

// --- System settings ---
async function loadSettings(){
  if(!hasPermission("settings.view"))return;
  try{var s=await apiFetch("/api/settings");setRetentionValue(parseInt(s.log_retention_days)||30);loadNotificationForm(s.notification_config);await loadUaProfiles()}catch(e){showNotification("error","设置加载失败")}
}
function loadNotificationForm(raw){var c={};try{c=typeof raw==="string"?JSON.parse(raw||"{}"):raw||{}}catch(e){};document.getElementById("notifyEnabled").checked=!!c.enabled;document.getElementById("notifyFailure").checked=c.notify_failure!==false;document.getElementById("notifyRecovery").checked=c.notify_recovery!==false;var map=[["emailEnabled",c.email?.enabled],["emailFrom",c.email?.from||""],["emailTo",c.email?.to||""],["wecomEnabled",c.wecom?.enabled],["wecomWebhook",c.wecom?.webhook],["telegramEnabled",c.telegram?.enabled],["telegramToken",c.telegram?.bot_token],["telegramChatId",c.telegram?.chat_id],["failureTemplateTitle",c.template?.failure_title||DEFAULT_NOTIFY_TEMPLATE.failure_title],["failureTemplateBody",c.template?.failure_body||DEFAULT_NOTIFY_TEMPLATE.failure_body],["recoveryTemplateTitle",c.template?.recovery_title||DEFAULT_NOTIFY_TEMPLATE.recovery_title],["recoveryTemplateBody",c.template?.recovery_body||DEFAULT_NOTIFY_TEMPLATE.recovery_body]];map.forEach(function(pair){var el=document.getElementById(pair[0]);if(el.type==="checkbox")el.checked=!!pair[1];else el.value=pair[1]||""});renderTemplateVariables();previewNotificationTemplate()}
function collectNotificationConfig(){return{enabled:document.getElementById("notifyEnabled").checked,notify_failure:document.getElementById("notifyFailure").checked,notify_recovery:document.getElementById("notifyRecovery").checked,email:{enabled:document.getElementById("emailEnabled").checked,provider:"cloudflare",from:document.getElementById("emailFrom").value.trim(),to:document.getElementById("emailTo").value.trim()},wecom:{enabled:document.getElementById("wecomEnabled").checked,webhook:document.getElementById("wecomWebhook").value.trim()},telegram:{enabled:document.getElementById("telegramEnabled").checked,bot_token:document.getElementById("telegramToken").value.trim(),chat_id:document.getElementById("telegramChatId").value.trim()},template:{failure_title:document.getElementById("failureTemplateTitle").value,failure_body:document.getElementById("failureTemplateBody").value,recovery_title:document.getElementById("recoveryTemplateTitle").value,recovery_body:document.getElementById("recoveryTemplateBody").value}}}
function resetNotificationTemplate(){document.getElementById("failureTemplateTitle").value=DEFAULT_NOTIFY_TEMPLATE.failure_title;document.getElementById("failureTemplateBody").value=DEFAULT_NOTIFY_TEMPLATE.failure_body;document.getElementById("recoveryTemplateTitle").value=DEFAULT_NOTIFY_TEMPLATE.recovery_title;document.getElementById("recoveryTemplateBody").value=DEFAULT_NOTIFY_TEMPLATE.recovery_body;previewNotificationTemplate()}
function renderTemplateVariables(){var box=document.getElementById("templateVars");if(!box||box.children.length)return;["site_name","status","url","type","message","http_code","response_time","fail_count","fail_threshold","occurred_at","recovered_at","duration","log_id"].forEach(function(key){var b=document.createElement("button");b.type="button";b.textContent="{{"+key+"}}";b.onclick=function(){navigator.clipboard?.writeText("{{"+key+"}}");showNotification("success","变量已复制")};box.appendChild(b)})}
function previewNotificationTemplate(){var values={site_name:"VPN1",status:"离线",url:"https://vpn.example.com",type:"HTTP",message:"连接超时",http_code:"0",response_time:"10000",fail_count:"3",fail_threshold:"3",occurred_at:"2026-07-17 14:30:25",recovered_at:"2026-07-17 14:38:25",duration:"约 8 分钟",log_id:"1208"},fill=function(text){return String(text||"").replace(/\{\{([a-z_]+)\}\}/g,function(_,key){return values[key]||""})};document.getElementById("failurePreviewTitle").textContent=fill(document.getElementById("failureTemplateTitle").value);document.getElementById("failurePreviewBody").textContent=fill(document.getElementById("failureTemplateBody").value);document.getElementById("recoveryPreviewTitle").textContent=fill(document.getElementById("recoveryTemplateTitle").value);document.getElementById("recoveryPreviewBody").textContent=fill(document.getElementById("recoveryTemplateBody").value)}
async function saveNotificationSettings(silent){if(!hasPermission("notifications.edit"))return false;var config=collectNotificationConfig(),emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(config.email.enabled&&(!emailPattern.test(config.email.from)||!emailPattern.test(config.email.to))){showNotification("error","请填写有效的邮件发件人和收件人地址");return false}if(config.telegram.enabled&&!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.telegram.bot_token)){showNotification("error","Telegram Bot Token 格式错误，请填写包含冒号的完整 Token");return false}if(config.telegram.enabled&&!/^-?\d+$/.test(config.telegram.chat_id)){showNotification("error","Telegram Chat ID 格式错误，应为数字");return false}try{await apiFetch("/api/settings",{method:"POST",body:JSON.stringify({notification_config:config})});if(!silent)showNotification("success","通知设置已保存");return true}catch(e){showNotification("error","通知设置保存失败");return false}}
async function testNotificationChannels(){if(!await saveNotificationSettings(true))return;try{var r=await apiFetch("/api/notifications/test",{method:"POST",body:"{}"});if(!r.channels)showNotification("error","请至少启用并配置一个通知渠道");else if(r.failed){var reason=(r.results||[]).filter(function(x){return x.status==="rejected"}).map(function(x){return x.error}).filter(Boolean).join("；");showNotification("error",reason||r.failed+" 个渠道测试失败")}else showNotification("success","已向 "+r.channels+" 个渠道发送测试")}catch(e){showNotification("error",e.message||"测试通知发送失败")}}
function setRetentionValue(days){
  var presets={7:true,30:true,90:true};var select=document.getElementById("retentionPreset");
  if(presets[days]){select.value=String(days);document.getElementById("customRetentionBox").style.display="none"}
  else{select.value="custom";document.getElementById("customRetentionBox").style.display="block";document.getElementById("customRetentionDays").value=days}
  document.getElementById("retentionSummary").innerText="当前保留 "+days+" 天，过期日志由每分钟定时任务自动删除。"
}
function onRetentionPresetChange(){var v=document.getElementById("retentionPreset").value;document.getElementById("customRetentionBox").style.display=v==="custom"?"block":"none"}
async function saveRetentionSettings(){
  var preset=document.getElementById("retentionPreset").value;var days=preset==="custom"?(parseInt(document.getElementById("customRetentionDays").value)||30):parseInt(preset);
  if(days<1||days>3650){showNotification("error","保留天数需在 1-3650 之间");return}
  try{await apiFetch("/api/settings",{method:"POST",body:JSON.stringify({log_retention_days:days})});setRetentionValue(days);showNotification("success","日志保留策略已保存")}catch(e){showNotification("error","设置保存失败")}
}
function renderUaDictionary(){
  var box=document.getElementById("uaDictionary");if(!box)return;box.innerHTML="";
  var pages=Math.max(1,Math.ceil(uaProfiles.length/_uaPageSize));if(_uaPage>=pages)_uaPage=pages-1;if(_uaPage<0)_uaPage=0;uaProfiles.slice(_uaPage*_uaPageSize,(_uaPage+1)*_uaPageSize).forEach(function(item){var row=document.createElement("div");row.className="ua-row";row.innerHTML='<div class="ua-device-icon"><i class="fas fa-globe"></i></div><div class="ua-info"><strong>'+escapeHtml(item.name)+'</strong><code title="'+escapeHtml(item.value)+'">'+escapeHtml(item.value)+'</code></div>'+(hasPermission("settings.edit")?'<div class="row-actions"><button class="btn btn-secondary btn-sm" title="编辑" onclick="editUaProfile(\''+item.id+'\')"><i class="fas fa-pen"></i></button><button class="btn btn-ghost-danger btn-sm" title="删除" onclick="deleteUaProfile(\''+item.id+'\')"><i class="fas fa-trash"></i></button></div>':'');box.appendChild(row)});var info=document.getElementById("uaPageInfo");if(info)info.textContent="第 "+(_uaPage+1)+"/"+pages+" 页，共 "+uaProfiles.length+" 条";["uaFirstBtn","uaPrevBtn"].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=_uaPage===0});["uaNextBtn","uaLastBtn"].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=_uaPage>=pages-1})
}
function changeUaPageSize(){_uaPageSize=parseInt(document.getElementById("uaPageSize").value)||10;_uaPage=0;renderUaDictionary()}
function uaFirstPage(){_uaPage=0;renderUaDictionary()}
function uaPrevPage(){if(_uaPage>0){_uaPage--;renderUaDictionary()}}
function uaNextPage(){if((_uaPage+1)*_uaPageSize<uaProfiles.length){_uaPage++;renderUaDictionary()}}
function uaLastPage(){_uaPage=Math.max(0,Math.ceil(uaProfiles.length/_uaPageSize)-1);renderUaDictionary()}
function escapeHtml(value){return String(value||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function startAddUa(){_editingUaId=null;document.getElementById("uaName").value="";document.getElementById("uaValue").value="";document.getElementById("uaEditor").style.display="grid"}
function editUaProfile(id){var item=uaProfiles.find(function(x){return x.id===id});if(!item)return;_editingUaId=id;document.getElementById("uaName").value=item.name;document.getElementById("uaValue").value=item.value;document.getElementById("uaEditor").style.display="grid"}
function cancelUaEdit(){_editingUaId=null;document.getElementById("uaEditor").style.display="none"}
async function persistUaProfiles(){await apiFetch("/api/settings",{method:"POST",body:JSON.stringify({ua_profiles:uaProfiles})});await loadUaProfiles()}
async function saveUaProfile(){
  var name=document.getElementById("uaName").value.trim(),value=document.getElementById("uaValue").value.trim();if(!name||!value){showNotification("error","请填写名称和 User-Agent 内容");return}
  if(_editingUaId){var item=uaProfiles.find(function(x){return x.id===_editingUaId});if(item){item.name=name;item.value=value}}
  else{uaProfiles.push({id:"ua_"+Date.now(),name:name,value:value});_uaPage=Math.max(0,Math.ceil(uaProfiles.length/_uaPageSize)-1)}
  try{await persistUaProfiles();cancelUaEdit();showNotification("success","User-Agent 字典已保存")}catch(e){showNotification("error","字典保存失败")}
}
async function deleteUaProfile(id){if(!confirm("确认删除该 User-Agent 字典项？"))return;uaProfiles=uaProfiles.filter(function(x){return x.id!==id});try{await persistUaProfiles();showNotification("success","字典项已删除")}catch(e){showNotification("error","删除失败")}}
function startAddCustomMenu(){_editingCustomMenuId=null;document.getElementById("customMenuName").value="";document.getElementById("customMenuUrl").value="";document.getElementById("customMenuEditor").style.display="grid"}
function editCustomMenu(id){var item=customMenus.find(function(x){return x.id===id});if(!item)return;_editingCustomMenuId=id;document.getElementById("customMenuName").value=item.name;document.getElementById("customMenuUrl").value=item.url;document.getElementById("customMenuEditor").style.display="grid"}
function cancelCustomMenuEdit(){_editingCustomMenuId=null;document.getElementById("customMenuEditor").style.display="none"}
async function persistCustomMenus(){await apiFetch("/api/settings",{method:"POST",body:JSON.stringify({custom_menus:customMenus})});customMenus=await apiFetch("/api/custom-menus");renderCustomMenus()}
async function saveCustomMenu(){
  var name=document.getElementById("customMenuName").value.trim(),url=document.getElementById("customMenuUrl").value.trim();if(!name||!url){showNotification("error","请填写菜单名称和 URL");return}if(!/^(#|\/|https?:\/\/)/i.test(url)){showNotification("error","URL 需以 #、/ 或 http(s):// 开头");return}
  if(_editingCustomMenuId){var item=customMenus.find(function(x){return x.id===_editingCustomMenuId});if(item){item.name=name;item.url=url}}else customMenus.push({id:"menu_"+Date.now(),name:name,url:url});
  try{await persistCustomMenus();cancelCustomMenuEdit();showNotification("success","菜单已保存")}catch(e){showNotification("error","菜单保存失败")}
}
async function deleteCustomMenu(id){if(!confirm("确认删除该菜单？"))return;customMenus=customMenus.filter(function(x){return x.id!==id});try{await persistCustomMenus();showNotification("success","菜单已删除")}catch(e){showNotification("error","删除失败")}}













