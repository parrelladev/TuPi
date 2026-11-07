
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectPath = "D:\Programacao\TuPi"
$logPath = Join-Path $projectPath "tupi.log"
$errorPath = Join-Path $projectPath "tupi-error.log"

# Inicia o servidor oculto
$script:server = Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList '/d', '/c', 'npm start' `
    -WorkingDirectory $projectPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorPath `
    -PassThru

# Cria o icone na bandeja
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Application
$tray.Text = "TuPi - Servidor"
$tray.Visible = $true

# Menu do botao direito
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$logs = $menu.Items.Add("Ver logs")
$logs.Add_Click({
    Start-Process powershell.exe -ArgumentList @(
        "-NoExit"
        "-Command"
        "Get-Content -LiteralPath '$logPath' -Tail 50 -Wait"
    )
})

$exit = $menu.Items.Add("Encerrar TuPi")
$exit.Add_Click({
    $script:context.ExitThread()
})

$tray.ContextMenuStrip = $menu

# Notificacao de inicializacao
$tray.BalloonTipTitle = "TuPi"
$tray.BalloonTipText = "Servidor iniciado!"
$tray.ShowBalloonTip(2000)

# Monitora o processo
$script:context = New-Object System.Windows.Forms.ApplicationContext

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
    $script:server.Refresh()
    if ($script:server.HasExited) {
        $script:context.ExitThread()
    }
})
$timer.Start()

try {
    [System.Windows.Forms.Application]::Run($script:context)
}
finally {
    $timer.Stop()

    if (-not $script:server.HasExited) {
        Start-Process taskkill.exe `
            -ArgumentList "/PID $($script:server.Id) /T /F" `
            -WindowStyle Hidden `
            -Wait
    }

    $tray.Visible = $false
    $tray.Dispose()
    $menu.Dispose()
    $timer.Dispose()
}
