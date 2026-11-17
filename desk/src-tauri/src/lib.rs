use tauri::webview::NewWindowResponse;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// 앱은 웹판을 그대로 띄운다. 웹판을 올리면 앱도 바로 바뀐다.
const HOME: &str = "https://hoseong911.github.io/hoclass/desk/";

// 앱 안 새 창으로 여는 곳: 구글 연결(파베 로그인 창)과 수첩 자신. 나머지는 기본 브라우저로.
// 파베 로그인 창은 opener 로 결과를 돌려주므로 앱 안에 열어야 한다.
fn keep_inside(url: &tauri::Url) -> bool {
  let host = url.host_str().unwrap_or("");
  url.scheme() == "about"
    || host == "hoseong911.github.io"
    || host == "accounts.google.com"
    || host.ends_with(".firebaseapp.com")
    || host.ends_with(".web.app")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("desk") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let url = HOME.parse().expect("주소가 바르지 않습니다");
      WebviewWindowBuilder::new(app, "desk", WebviewUrl::External(url))
        .title("오늘, 교무노트")
        .inner_size(1480.0, 940.0)
        .min_inner_size(900.0, 600.0)
        // 위젯으로 깔았을 때 바탕화면이 비쳐 보이게. 보통 창에서는 CSS 가 바탕을 불투명하게 칠한다.
        .transparent(true)
        .center()
        .on_new_window(|url, _features| {
          if keep_inside(&url) {
            NewWindowResponse::Allow
          } else {
            let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
            NewWindowResponse::Deny
          }
        })
        .build()?;
      // 화면 배율이 큰 노트북(200% 등)에서는 기본 크기가 화면보다 커서 최대화로 연다.
      let win = app.get_webview_window("desk").expect("창이 없습니다");
      if let (Ok(Some(m)), Ok(s)) = (win.current_monitor(), win.outer_size()) {
        let area = m.work_area().size;
        if s.width > area.width || s.height > area.height {
          let _ = win.maximize();
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("앱을 띄우지 못했습니다");
}
