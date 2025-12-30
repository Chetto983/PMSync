# FolderSidebar Integration Guide - Drag-and-Drop

**Last Step**: Wrap folder items in `DroppableFolderItem` to enable folder grow animation

## Quick Integration

The `DroppableFolderItem` component is ready to use. It needs to wrap each folder item in FolderSidebar to make them accept email drops with the beautiful grow animation.

### Location
`frontend/components/email/sidebar/FolderSidebar.tsx` around **line 469**

### Current Code (Line 469-475)
```typescript
<SortableFolderItem
  folder={folder}
  icon={getFolderIcon(folder)}
  label={folderName}
  selected={filters.folderId === folder.id}
  onClick={() => handleProviderFolderClick(provider.id, folder)}
/>
```

### Updated Code (Wrap in DroppableFolderItem)
```typescript
import { DroppableFolderItem } from './DroppableFolderItem';

// Inside the sortedFolders.map() loop:
<DroppableFolderItem
  folderId={folder.id}
  providerId={provider.id}
>
  <SortableFolderItem
    folder={folder}
    icon={getFolderIcon(folder)}
    label={folderName}
    selected={filters.folderId === folder.id}
    onClick={() => handleProviderFolderClick(provider.id, folder)}
  />
</DroppableFolderItem>
```

## What This Does

### ✨ Folder Grow Animation
When you drag an email over a folder:
- **Folder grows 5% larger** (`scale(1.05)`)
- **Blue highlight** appears (primary color @ 12% opacity)
- **Drop shadow** adds depth
- **Smooth 200ms animation**

### 🛡️ Provider Validation
- **Valid drop** (same provider): Blue highlight + grow
- **Invalid drop** (different provider): Red tint + forbidden cursor
- **Cross-provider protection**: Prevents accidental moves

## Complete Integration Example

```typescript
// At the top of FolderSidebar.tsx, add import:
import { DroppableFolderItem } from './DroppableFolderItem';

// Find the sortedFolders.map() section (around line 455-495):
{sortedFolders.map((folder) => {
  const folderName = getFolderDisplayName(folder, getFolderLabel);

  return (
    <Box
      key={folder.id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        '&:hover .folder-menu-btn': {
          opacity: 1,
        },
      }}
    >
      {/* ⭐ WRAP SORTABLE ITEM IN DROPPABLE WRAPPER */}
      <DroppableFolderItem
        folderId={folder.id}
        providerId={provider.id}
      >
        <SortableFolderItem
          folder={folder}
          icon={getFolderIcon(folder)}
          label={folderName}
          selected={filters.folderId === folder.id}
          onClick={() => handleProviderFolderClick(provider.id, folder)}
        />
      </DroppableFolderItem>

      {/* Show menu for custom folders only (not system folders) */}
      {!folder.isSystem && (
        <IconButton
          size="small"
          className="folder-menu-btn"
          onClick={(e) => handleFolderMenu(e, folder)}
          sx={{
            p: 0.25,
            opacity: 0,
            transition: 'opacity 0.15s',
            mr: 0.5,
          }}
        >
          <MoreHorizontal size={14} />
        </IconButton>
      )}
    </Box>
  );
})}
```

## Why This Works

### @dnd-kit Architecture
- **ThreadList** has its own `DndContext` for dragging emails
- **FolderSidebar** already has `DndContext` for folder reordering (per provider)
- Both contexts can coexist because they're at different levels
- `DroppableFolderItem` registers folders as drop targets within their provider's context

### No Conflicts
- Folder reordering: Uses `SortableContext` + `SortableFolderItem`
- Email dropping: Uses `DroppableFolderItem` wrapper
- Both work together seamlessly ✅

## Testing

Once integrated, test these scenarios:

1. **Same Provider Drop** ✅
   - Drag email from Gmail
   - Hover over Gmail folder
   - Folder should **grow larger** with blue highlight
   - Drop → Success toast

2. **Cross-Provider Drop** ❌
   - Drag email from Gmail
   - Hover over Outlook folder
   - Folder should show **red tint** + forbidden cursor
   - Drop → Error toast (or no action)

3. **Folder Reordering Still Works** ✅
   - Drag folders to reorder them
   - Should work as before (unchanged)

## Animation Specifications

```typescript
// Inside DroppableFolderItem:
sx={{
  transition: 'all 200ms ease',           // Smooth animation
  transform: isOver ? 'scale(1.05)' : 'scale(1)', // Grow 5%
  bgcolor: isOver && isValidDrop
    ? alpha(theme.palette.primary.main, 0.12)     // Blue highlight
    : isInvalidDrop && isOver
      ? alpha(theme.palette.error.main, 0.08)      // Red tint
      : 'transparent',
  boxShadow: isOver && isValidDrop
    ? '0 2px 8px rgba(0, 0, 0, 0.1)'     // Depth shadow
    : 'none',
  cursor: isInvalidDrop && isOver
    ? 'not-allowed'                       // Forbidden cursor
    : 'pointer',
}}
```

## Already Completed ✅

- ✅ `DraggableThreadListItem` - Makes emails draggable
- ✅ `DroppableFolderItem` - Makes folders droppable with grow animation
- ✅ `ThreadList` wrapped in `DndContext` with `DragOverlay`
- ✅ `email.tsx` has provider data and drop handler
- ✅ Translations (English + Italian)
- ✅ Provider validation logic
- ✅ Toast notifications
- ✅ ESLint warnings fixed
- ✅ TypeScript types correct

## Only 1 Step Remaining

**Add 1 import + wrap 1 component = Done!**

That's it! Just wrap `SortableFolderItem` in `DroppableFolderItem` and the folder grow animation will work.

---

**Implementation**: Claude Code
**Date**: 2025-12-30
**Status**: Ready for final integration
