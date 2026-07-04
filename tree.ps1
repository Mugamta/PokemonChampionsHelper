function Get-Tree($path = ".", $indent = "") {
    $items = Get-ChildItem $path | Where-Object { $_.Name -notmatch "node_modules|\.git|^public$|^\.nuxt$" }
    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $isLast = $i -eq ($items.Count - 1)
        
        # 깨지지 않는 표준 기호로 대체
        $marker = if ($isLast) { "+-- " } else { "|-- " }
        Write-Host "$indent$marker$($item.Name)"
        
        if ($item.PSIsContainer) {
            $pad = if ($isLast) { "    " } else { "|   " }
            Get-Tree $item.FullName "$indent$pad"
        }
    }
}
Get-Tree
