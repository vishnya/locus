-- Locus hotkeys (chord: Ctrl+Shift+L, then second key)
-- Ctrl+Shift+L -> L: quick note capture
-- Ctrl+Shift+L -> S: flash status on screen
-- Ctrl+Shift+L -> T: open Claude Code for priority conversation

local function lcRun(args, callback)
  hs.task.new("/bin/zsh", function(code, stdout, stderr)
    if callback then callback(code, stdout, stderr) end
  end, {"-l", "-c", "lc " .. args}):start()
end

local locusTap = nil
local locusTimeout = nil

local function exitLocusMode()
  if locusTap then locusTap:stop(); locusTap = nil end
  if locusTimeout then locusTimeout:stop(); locusTimeout = nil end
  hs.alert.closeAll()
end

local function handleNote()
  local button, text = hs.dialog.textPrompt("Locus Note", "Quick capture:", "", "Save", "Cancel")
  if button == "Save" and text ~= "" then
    local escaped = text:gsub("'", "'\\''")
    lcRun("note '" .. escaped .. "'", function(code)
      if code == 0 then
        hs.alert.show("Noted", nil, nil, 1)
      else
        hs.alert.show("Locus error", nil, nil, 3)
      end
    end)
  end
end

local function handleStatus()
  lcRun("status", function(code, stdout)
    if code == 0 and stdout and stdout ~= "" then
      hs.alert.show(stdout:sub(1, 500), nil, nil, 5)
    else
      hs.alert.show("No priorities set", nil, nil, 2)
    end
  end)
end

local function handleThink()
  local script = [[
    tell application "Terminal"
      activate
      do script "cd ~/code/locus && claude '/think'"
    end tell
  ]]
  hs.osascript.applescript(script)
end

local function enterLocusMode()
  exitLocusMode()
  hs.alert.show("Locus: [L]note  [S]tatus  [T]hink", nil, nil, 3)

  locusTap = hs.eventtap.new({hs.eventtap.event.types.keyDown}, function(event)
    local key = hs.keycodes.map[event:getKeyCode()]
    exitLocusMode()

    if key == "l" then
      hs.timer.doAfter(0.05, handleNote)
    elseif key == "s" then
      handleStatus()
    elseif key == "t" then
      handleThink()
    end

    return true
  end)
  locusTap:start()

  locusTimeout = hs.timer.doAfter(3, exitLocusMode)
end

hs.hotkey.bind({"ctrl", "shift"}, "l", enterLocusMode)
