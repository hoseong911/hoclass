use tauri::{Manager, PhysicalPosition, PhysicalSize};

// 위젯 창을 바탕화면 우측 3/4에 깔고(좌측 1/4은 아이콘 자리로 비운다) 항상 맨 아래로 보낸다.
fn place_widget(win: &tauri::WebviewWindow) {
  if let Ok(Some(monitor)) = win.primary_monitor() {
    let sz = monitor.size();
    let w = sz.width as f64;
    let h = sz.height as f64;
    let taskbar = 56.0; // 작업표시줄 여유
    let x = (w * 0.25).round() as i32;
    let ww = (w * 0.75).round().max(400.0) as u32;
    let hh = (h - taskbar).round().max(300.0) as u32;
    let _ = win.set_position(PhysicalPosition::new(x, 0));
    let _ = win.set_size(PhysicalSize::new(ww, hh));
  }
  let _ = win.set_always_on_bottom(true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 위젯은 바탕화면에 깔고 띄운다.
      if let Some(win) = app.get_webview_window("widget") {
        place_widget(&win);
        let _ = win.show();
      }
      // 수첩 창은 만들어만 두고 숨긴다. 위젯의 '수첩 열기'를 누르면 보인다.
      // (닫아도 사라지지 않고 숨기만 하므로 로그인이 풀리지 않는다)
      if let Some(desk) = app.get_webview_window("desk") {
        let d = desk.clone();
        desk.on_window_event(move |e| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = e {
            api.prevent_close();
            let _ = d.hide();
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
