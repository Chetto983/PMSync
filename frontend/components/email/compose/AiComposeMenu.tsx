import { useState, useRef, useEffect } from 'react';
import {
    Box,
    Typography,
    TextField,
    InputAdornment,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    CircularProgress,
    Popover
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
    Create as DraftIcon,
    Psychology as StyleIcon,
    EmojiEmotions as CasualIcon
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
        const fullPrompt = promptLabel;

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
            label: t.email.composer.aiMenu.fixSpelling,
            icon: <SpellcheckIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'shorten',
            label: t.email.composer.aiMenu.makeShorter,
            icon: <CompressIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'expand',
            label: t.email.composer.aiMenu.makeLonger,
            icon: <ExpandIcon fontSize="small" />,
            type: 'refine'
        },
        {
            id: 'tone_professional',
            label: t.email.composer.aiMenu.makeProfessional,
            icon: <ProfessionalIcon fontSize="small" />,
            type: 'tone'
        },
        {
            id: 'tone_friendly',
            label: t.email.composer.aiMenu.makeFriendly,
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
                    maxWidth: 'calc(100vw - 32px)',
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
                        {hasSelection ? t.email.composer.aiMenu.titleRefine : t.email.composer.aiMenu.titleDraft}
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
                        placeholder={hasSelection ? t.email.composer.aiMenu.placeholderRefine : t.email.composer.aiMenu.placeholderDraft}
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
                            {/* Draft templates */}
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.draftProjectUpdate)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText
                                    primary={t.email.composer.aiMenu.draftProjectUpdate}
                                    secondary={t.email.composer.aiMenu.draftProjectUpdateSecondary}
                                />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.draftFollowUp)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText
                                    primary={t.email.composer.aiMenu.draftFollowUp}
                                    secondary={t.email.composer.aiMenu.draftFollowUpSecondary}
                                />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.draftMeetingRequest)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.draftMeetingRequest} />
                            </ListItemButton>

                            <Divider sx={{ my: 1 }} />

                            {/* Tone section header */}
                            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                                {t.email.composer.aiMenu.toneSection}
                            </Typography>

                            {/* Tone options for new drafts */}
                            <ListItemButton onClick={() => handleQuickAction('tone_professional', t.email.composer.aiMenu.toneProfessional)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><ProfessionalIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneProfessional} />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('tone_friendly', t.email.composer.aiMenu.toneFriendly)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><FriendlyIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneFriendly} />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.toneCasual)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><CasualIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneCasual} />
                            </ListItemButton>

                            <Divider sx={{ my: 1 }} />

                            {/* Personalization indicator */}
                            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <StyleIcon fontSize="small" color="primary" />
                                <Typography variant="caption" color="text.secondary">
                                    {t.email.composer.aiMenu.writingStyleActive}
                                </Typography>
                            </Box>
                        </>
                    )}
                </List>
            </Box>
        </Popover>
    );
}
