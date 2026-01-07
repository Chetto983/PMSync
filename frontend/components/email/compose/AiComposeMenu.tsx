import { useState, useRef, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    InputAdornment,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    CircularProgress,
    Chip,
    MenuItem,
    Select,
    Popover,
    Button
} from '@mui/material';
import {
    AutoAwesome as AiIcon,
    Send as SendIcon,
    Close as CloseIcon,
    Spellcheck as SpellcheckIcon,
    Compress as CompressIcon,
    UnfoldMore as ExpandIcon,
    SentimentSatisfied as FriendlyIcon,
    Business as ProfessionalIcon,
    Bolt as UrgentIcon,
    FormatListBulleted as ListIcon,
    Translate as TranslateIcon,
    Create as DraftIcon
} from '@mui/icons-material';
import { useTranslations } from '@/lib/hooks/use-translations';

export type AiActionType =
    | 'custom'
    | 'fix_spelling'
    | 'shorten'
    | 'expand'
    | 'tone_professional'
    | 'tone_friendly'
    | 'tone_urgent'
    | 'summarize'
    | 'translate';

export type AiComposeMenuProps = {
    anchorEl: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    onCompose: (prompt: string, actionType: AiActionType) => Promise<void>;
    isLoading: boolean;
    hasSelection: boolean; // Context: are we refining selection or drafting new?
};

export default function AiComposeMenu({
    anchorEl,
    open,
    onClose,
    onCompose,
    isLoading,
    hasSelection
}: AiComposeMenuProps) {
    const t = useTranslations();
    const [customPrompt, setCustomPrompt] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    const handleQuickAction = (action: AiActionType, promptLabel: string) => {
        // Construct a specific prompt based on the action
        let fullPrompt = promptLabel;

        // We pass the "intent" label to the parent, which will construct the final prompt context
        onCompose(fullPrompt, action);
    };

    const handleCustomSubmit = () => {
        if (!customPrompt.trim()) return;
        onCompose(customPrompt, 'custom');
        setCustomPrompt('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCustomSubmit();
        }
    };

    // Quick Action Config
    const actions = [
        {
            id: 'fix_spelling',
            label: 'Fix spelling & grammar',
            icon: <SpellcheckIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'shorten',
            label: 'Make shorter',
            icon: <CompressIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'expand',
            label: 'Make longer',
            icon: <ExpandIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'tone_professional',
            label: 'Make professional',
            icon: <ProfessionalIcon fontSize="small" />,
            type: 'tone'
        },
        {
            id: 'tone_friendly',
            label: 'Make friendly',
            icon: <FriendlyIcon fontSize="small" />,
            type: 'tone'
        },
    ] as const;

    return (
        <Popover
            open={open}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
            }}
            transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
            }}
            PaperProps={{
                sx: {
                    width: 320,
                    borderRadius: 3,
                    mt: 1,
                    overflow: 'hidden',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                }
            }}
        >
            <Box sx={{ bgcolor: 'background.paper' }}>
                {/* Header */}
                <Box
                    sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                        color: 'white'
                    }}
                >
                    <AiIcon fontSize="small" />
                    <Typography variant="subtitle2" fontWeight={600}>
                        {hasSelection ? 'AI Refine' : 'AI Draft'}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                {/* Custom Input */}
                <Box sx={{ p: 2 }}>
                    <TextField
                        inputRef={inputRef}
                        fullWidth
                        multiline
                        maxRows={3}
                        placeholder={hasSelection ? "Ask AI to edit selection..." : "Draft an email about..."}
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        variant="outlined"
                        size="small"
                        InputProps={{
                            sx: { borderRadius: 2, pr: 0.5 },
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        onClick={handleCustomSubmit}
                                        disabled={!customPrompt.trim() || isLoading}
                                        color="primary"
                                    >
                                        {isLoading ? <CircularProgress size={16} /> : <SendIcon fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            )
                        }}
                    />
                </Box>

                <Divider />

                {/* Quick Actions List */}
                <List dense sx={{ py: 0, maxHeight: 300, overflow: 'auto' }}>
                    {hasSelection ? (
                        // Actions relevant to selected text
                        actions.map((action) => (
                            <ListItemButton
                                key={action.id}
                                onClick={() => handleQuickAction(action.id as AiActionType, action.label)}
                                disabled={isLoading}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                                    {action.icon}
                                </ListItemIcon>
                                <ListItemText primary={action.label} />
                            </ListItemButton>
                        ))
                    ) : (
                        // Actions relevant to new drafts
                        <>
                            <ListItemButton onClick={() => handleQuickAction('custom', 'Draft a professional email about project updates')}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Draft: Project Update" secondary="Professional tone" />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', 'Draft a polite follow-up email')}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Draft: Follow-up" secondary="Polite tone" />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', 'Draft a meeting request')}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary="Draft: Meeting Request" />
                            </ListItemButton>
                        </>
                    )}
                </List>
            </Box>
        </Popover>
    );
}
