param(
    [string]$Action,
    [Parameter(ValueFromRemainingArguments)]$RemainingArgs
)

$Image = "willhallonline/ansible:2.18-ubuntu-24.04"
$SshKey = "$env:USERPROFILE\.ssh\id_ed25519"

if ($Action -eq "vault") {
    $EnvEditor = if ($RemainingArgs[0] -eq "edit") { @("-e", "EDITOR=vi") } else { @() }

    docker run --rm -it `
      -v "${PWD}:/work" `
      -w /work `
      $EnvEditor `
      $Image ansible-vault $RemainingArgs
} else {
    $PassFlags = @("--ask-vault-pass", "--ask-become-pass")

    if (-not $Action) {
        $FinalArgs = @("site.yml") + $PassFlags
    } else {
        $FinalArgs = @($Action) + $RemainingArgs + $PassFlags
    }

    docker run --rm -it `
      -v "${PWD}:/work" `
      -v "${SshKey}:/tmp/id_ed25519" `
      -e ANSIBLE_HOST_KEY_CHECKING=False `
      -w /work `
      $Image sh -c "mkdir -p /root/.ssh && cp /tmp/id_ed25519 /root/.ssh/id_ed25519 && chmod 600 /root/.ssh/id_ed25519 && ansible-playbook -i inventory.ini $FinalArgs"
}
