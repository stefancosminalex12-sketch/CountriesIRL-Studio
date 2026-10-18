' Starts the Downloader's helper with no window. A copy of this file in the
' Windows Startup folder runs it every time you sign in, so the Studio's
' Downloader just works whenever the PC is on. To stop that, delete
' "CountriesIRL Studio helper.vbs" from the Startup folder (Win+R, type
' shell:startup, press Enter).
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
helper = "C:\Users\stefa\OneDrive\Desktop\CountriesIRL_Studio\helper\server.mjs"
If fso.FileExists(helper) Then
  shell.CurrentDirectory = fso.GetParentFolderName(helper)
  shell.Run """C:\Program Files\nodejs\node.exe"" """ & helper & """", 0, False
End If
