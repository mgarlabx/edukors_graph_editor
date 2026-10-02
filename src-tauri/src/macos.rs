//! What macOS adds to the Edit menu on its own: AutoFill, Start Dictation and
//! Emoji & Symbols. None of them has a use in the editor.

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{class, msg_send, sel};
use objc2_foundation::NSString;

/// Asks AppKit not to add the items, before the menu is ever shown.
pub fn quiet_edit_menu() {
    unsafe {
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        for key in ["NSDisabledDictationMenuItem", "NSDisabledCharacterPaletteMenuItem", "NSDisabledAutoFillMenuItem"] {
            let key = NSString::from_str(key);
            let _: () = msg_send![defaults, setBool: true, forKey: &*key];
        }
    }
}

/// Takes out of the Edit menu (the third of the bar) whatever AppKit put there
/// all the same: the items of its own actions, and AutoFill, a submenu, where
/// the editor puts none. Runs on the main thread, after each set_menu.
pub fn strip_edit_menu() {
    let foreign: [Sel; 4] = [sel!(startDictation:), sel!(orderFrontCharacterPalette:), sel!(autofill:), sel!(_handleInsertFromContactsCommand:)];
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let bar: *mut AnyObject = msg_send![app, mainMenu];
        if bar.is_null() {
            return;
        }
        let count: isize = msg_send![bar, numberOfItems];
        if count < 3 {
            return;
        }
        let edit_item: *mut AnyObject = msg_send![bar, itemAtIndex: 2isize];
        let edit: *mut AnyObject = msg_send![edit_item, submenu];
        if edit.is_null() {
            return;
        }
        let mut i: isize = msg_send![edit, numberOfItems];
        while i > 0 {
            i -= 1;
            let item: *mut AnyObject = msg_send![edit, itemAtIndex: i];
            let action: Option<Sel> = msg_send![item, action];
            let submenu: Option<Retained<AnyObject>> = msg_send![item, submenu];
            if submenu.is_some() || action.is_some_and(|a| foreign.contains(&a)) {
                let _: () = msg_send![edit, removeItemAtIndex: i];
            }
        }
        // No separator left at the end, after what was taken out.
        loop {
            let n: isize = msg_send![edit, numberOfItems];
            if n == 0 {
                break;
            }
            let last: *mut AnyObject = msg_send![edit, itemAtIndex: n - 1];
            let separator: bool = msg_send![last, isSeparatorItem];
            if !separator {
                break;
            }
            let _: () = msg_send![edit, removeItemAtIndex: n - 1];
        }
    }
}
