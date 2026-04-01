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
import { Sparkles as AiIcon, Send as SendIcon, X as CloseIcon, SpellCheck as SpellcheckIcon, Minimize2 as CompressIcon, Maximize2 as ExpandIcon, Smile as FriendlyIcon, Briefcase as ProfessionalIcon, PenLine as DraftIcon, Brain as StyleIcon, PartyPopper as CasualIcon, Check as CheckIcon } from 'lucide-react';
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

export type ToneType = 'professional' | 'friendly' | 'casual' | null;

export type AiComposeMenuProps = {
    anchorEl: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    onCompose: (prompt: string, actionType: AiActionType, tone?: ToneType) => Promise<void>;
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
    const [selectedTone, setSelectedTone] = useState<ToneType>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    // Reset tone when menu closes - handled via onClose/TransitionProps instead of useEffect
    // to avoid "setState in effect" lint error

    const handleQuickAction = (action: AiActionType, promptLabel: string) => {
        // Derive tone from tone-type actions
        const tone: ToneType = action === 'tone_professional' ? 'professional'
            : action === 'tone_friendly' ? 'friendly'
            : selectedTone;

        onCompose(promptLabel, action, tone);
    };

    const handleCustomSubmit = () => {
        if (!customPrompt.trim()) return;
        onCompose(customPrompt, 'custom', selectedTone);
        setCustomPrompt('');
        setSelectedTone(null);
    };

    // Tone selection only sets state - doesn't trigger generation
    const handleToneSelect = (tone: ToneType) => {
        setSelectedTone(prev => prev === tone ? null : tone); // Toggle if same
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
            icon: <SpellcheckIcon size={18} />,
            type: 'refine'
        },
        {
            id: 'shorten',
            label: t.email.composer.aiMenu.makeShorter,
            icon: <CompressIcon size={18} />,
            type: 'refine'
        },
        {
            id: 'expand',
            label: t.email.composer.aiMenu.makeLonger,
            icon: <ExpandIcon size={18} />,
            type: 'refine'
        },
        {
            id: 'tone_professional',
            label: t.email.composer.aiMenu.makeProfessional,
            icon: <ProfessionalIcon size={18} />,
            type: 'tone'
        },
        {
            id: 'tone_friendly',
            label: t.email.composer.aiMenu.makeFriendly,
            icon: <FriendlyIcon size={18} />,
            type: 'tone'
        },
    ] as const;

    return (
        <Popover
            open={open}
            anchorEl={anchorEl}
            onClose={onClose}
            hideBackdrop
            disableScrollLock
            style={{ pointerEvents: 'none' }}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
            }}
            transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
            }}
            slotProps={{
                backdrop: {
                    invisible: true,
                    style: { pointerEvents: 'none' },
                },
                transition: {
                    onExited: () => setSelectedTone(null), // Reset tone when popover closes
                },
            }}
            PaperProps={{
                sx: {
                    pointerEvents: 'auto',
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
                        background: (theme) => `linear-gradient(45deg, ${theme.palette.primary.main} 30%, ${theme.palette.primary.light} 90%)`,
                        color: 'white'
                    }}
                >
                    <AiIcon size={18} />
                    <Typography variant="subtitle2" fontWeight={600}>
                        {hasSelection ? t.email.composer.aiMenu.titleRefine : t.email.composer.aiMenu.titleDraft}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
                        <CloseIcon size={18} />
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
                                        {isLoading ? <CircularProgress size={16} /> : <SendIcon size={18} />}
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
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={t.email.composer.aiMenu.draftProjectUpdate}
                                    secondary={t.email.composer.aiMenu.draftProjectUpdateSecondary}
                                />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.draftFollowUp)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon size={18} /></ListItemIcon>
                                <ListItemText
                                    primary={t.email.composer.aiMenu.draftFollowUp}
                                    secondary={t.email.composer.aiMenu.draftFollowUpSecondary}
                                />
                            </ListItemButton>
                            <ListItemButton onClick={() => handleQuickAction('custom', t.email.composer.aiMenu.draftMeetingRequest)}>
                                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><DraftIcon size={18} /></ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.draftMeetingRequest} />
                            </ListItemButton>

                            <Divider sx={{ my: 1 }} />

                            {/* Tone section header */}
                            <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block' }}>
                                {t.email.composer.aiMenu.toneSection}
                            </Typography>

                            {/* Tone options - selection only, no generation */}
                            <ListItemButton
                                onClick={() => handleToneSelect('professional')}
                                selected={selectedTone === 'professional'}
                                sx={{ bgcolor: selectedTone === 'professional' ? 'action.selected' : undefined }}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: selectedTone === 'professional' ? 'primary.main' : 'text.secondary' }}>
                                    <ProfessionalIcon size={18} />
                                </ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneProfessional} />
                                {selectedTone === 'professional' && <CheckIcon size={18} color="primary" />}
                            </ListItemButton>
                            <ListItemButton
                                onClick={() => handleToneSelect('friendly')}
                                selected={selectedTone === 'friendly'}
                                sx={{ bgcolor: selectedTone === 'friendly' ? 'action.selected' : undefined }}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: selectedTone === 'friendly' ? 'primary.main' : 'text.secondary' }}>
                                    <FriendlyIcon size={18} />
                                </ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneFriendly} />
                                {selectedTone === 'friendly' && <CheckIcon size={18} color="primary" />}
                            </ListItemButton>
                            <ListItemButton
                                onClick={() => handleToneSelect('casual')}
                                selected={selectedTone === 'casual'}
                                sx={{ bgcolor: selectedTone === 'casual' ? 'action.selected' : undefined }}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: selectedTone === 'casual' ? 'primary.main' : 'text.secondary' }}>
                                    <CasualIcon size={18} />
                                </ListItemIcon>
                                <ListItemText primary={t.email.composer.aiMenu.toneCasual} />
                                {selectedTone === 'casual' && <CheckIcon size={18} color="primary" />}
                            </ListItemButton>

                            <Divider sx={{ my: 1 }} />

                            {/* Personalization indicator */}
                            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <StyleIcon size={18} color="primary" />
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
