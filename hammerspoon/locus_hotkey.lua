-- Locus quick capture (Ctrl+Shift+N)
hs.hotkey.bind({"ctrl", "shift"}, "n", function()
  local button, text = hs.dialog.textPrompt("Locus Note", "Quick capture:", "", "Save", "Cancel")
  if button == "Save" and text ~= "" then
    local escaped = text:gsub("'", "'\\''")
    hs.task.new("/bin/zsh", function(code, stdout, stderr)
      if code == 0 then
        hs.alert.show("Noted", nil, nil, 1)
      else
        hs.alert.show("Locus error: " .. (stderr or ""), nil, nil, 3)
      end
    end, {"-l", "-c", "lc note '" .. escaped .. "'"}):start()
  end
end)
