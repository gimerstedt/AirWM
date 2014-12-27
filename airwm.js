var x11  = require('x11');
var exec = require('child_process').exec;
var keysym = require('keysym');

// Load the objects from objects.js
var Workspaces = require('./objects').Workspaces,
    Workspace  = require('./objects').Workspace,
    Screen     = require('./objects').Screen,
    Window     = require('./objects').Window,
    Container  = require('./objects').Container;

// The workspaces currently available
var workspaces;

// The available key shortcuts that are known
var config = require("./config");
var programs = config.startup_applications
var keybindings = config.keybindings

var focus_window = null;

x11.createClient(function(err, display) {
	// Set the connection to the X server in global namespace
	// as a hack since almost every file uses it
	global.X = display.client;
  var min = display.min_keycode;
  var max = display.max_keycode;

  X.GetKeyboardMapping(min, max-min, function(err, list) {
    // KeySymbol to KeyCode Map
    ks2kc = {};
    for(var k in list){
      for(var m in list[k]){
        ks2kc[list[k][m]] = parseInt(k)+min;
      }
    }

    // Create the workspaces object
    workspaces = new Workspaces( display.screen );

    // By adding the substructure redirect you become the window manager.
    // TODO Should we register for all screens?
    global.X.ChangeWindowAttributes(
      display.screen[0].root,
      {
        // node-x11/lib/eventmask.js
        // https://github.com/sidorares/node-x11/blob/master/lib/eventmask.js
        // Comment non-required events
        eventMask:  x11.eventMask.KeyPress             |
                    x11.eventMask.KeyRelease           |
                    x11.eventMask.ButtonPress          |
                    x11.eventMask.ButtonRelease        |
                    x11.eventMask.EnterWindow          |
                    x11.eventMask.LeaveWindow          |  // Event Type: 8
                    x11.eventMask.PointerMotion        |
                    x11.eventMask.PointerMotionHint    |
                    x11.eventMask.Button1Motion        |
                    x11.eventMask.Button2Motion        |
                    x11.eventMask.Button3Motion        |
                    x11.eventMask.Button4Motion        |
                    x11.eventMask.Button5Motion        |
                    x11.eventMask.ButtonMotion         |
                    x11.eventMask.KeymapState          | // Event Type: 11
                    x11.eventMask.Exposure             |
                    x11.eventMask.VisibilityChange     |
                    x11.eventMask.StructureNotify      |
                    x11.eventMask.ResizeRedirect       |
                    x11.eventMask.SubstructureNotify   |
                    x11.eventMask.SubstructureRedirect |
                    x11.eventMask.FocusChange          |
                    x11.eventMask.PropertyChange       |
                    x11.eventMask.ColormapChange       |
                    x11.eventMask.OwnerGrabButton
      },
      function(err) {
        if( err.error === 10 ) {
          console.error( "Another window manager is already running" );
        }
        console.error(err);
        process.exit(1);
      }
    );

    // Grab all key combinations which are specified in the configuration file.
    keybindings.forEach(function(keyConfiguration){
      keyCode = ks2kc[keysym.fromName(keyConfiguration.key).keysym];
      global.X.GrabKey(display.screen[0].root, 0, translateModifiers(keyConfiguration.modifier),
          keyCode, 0, 1);
    });

    // Load the programs that should get started
    // and start them
    programs.forEach(function(curr,ind,arr) { exec(curr) });
  });
}).on('error', function(err) {
	console.error(err);
}).on('event', function(ev) {
	//console.log(ev);
	if( ev.name === "MapRequest" ) {
		workspaces.getCurrentWorkspace().addWindow( ev.wid );
		workspaces.forEachWindow(function(window){
			if(window.window_id === ev.wid && focus_window === null){
				focus_window = window;
			}
		});
	} else if ( ev.name === "DestroyNotify" ) {
		// Just search through all windows and remove the window
		// that got destroyed out of the tree.
		workspaces.forEachWindow(function(window) {
			if( window.window_id === ev.wid ) {
				window.remove();
			}
		});
	} else if ( ev.name === "ConfigureRequest" ) {
		// Don't allow them window to resize, we decide
		// how large the window is going to be!
		//X.ResizeWindow(ev.wid, ev.width, ev.height);
	} else if ( ev.name === "KeyPress" ) {
		// Go through all configured key combinations.
		for(var i = 0; i < keybindings.length; ++i){
			var binding =  keybindings[i];
			// Check if this is the binding which we are seeking.
			if(ks2kc[keysym.fromName(binding.key).keysym] === ev.keycode){
				if(translateModifiers(binding.modifier) === (ev.buttons&translateModifiers(binding.modifier))){
					if(binding.hasOwnProperty('command')){
						console.log("Launching airwm-command: '", binding.command, "'.");
						switch(binding.command){
							case "Shutdown":
								process.exit(0);
								break;
							case "CloseWindow":
								console.log("Closing window...", ev.child);
								workspaces.forEachWindow(function(window){
									if(window.window_id === ev.child){
										window.destroy();
									}
								});
								break;
							case "SwitchTilingMode":
								console.log("Switching tiling mode");
								workspaces.getCurrentWorkspace().switchTilingMode();
								break;
							case "MoveWindowLeft":
								focus_window.moveLeft();
								break;
							case "MoveWindowDown":
								focus_window.moveDown();
								break;
							case "MoveWindowUp":
								focus_window.moveUp();
								break;
							case "MoveWindowRight":
								focus_window.moveRight();
								break;
							default:
								break;
						}
					} else if(binding.hasOwnProperty("program")){
						console.log("Launching external application: '", binding.program, "'.");
						exec( binding.program );
					}
				}
			}
		}
	} else if ( ev.name === "KeyRelease" ) {
	}
});

translateModifiers = function(sModifier){
	switch(sModifier){
		case "super":
			return 64;
		default:
			return 0;
	}
}

