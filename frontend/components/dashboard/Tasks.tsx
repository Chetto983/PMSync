import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  List,
  ListItemButton,
  ListItemText,
  Checkbox,
  IconButton,
  Button,
  Chip,
  InputAdornment,
  Divider,
} from '@mui/material';
import {
  Plus,
  Calendar,
  Flag,
  MoreVertical,
  Filter,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  project?: string;
  assignee?: string;
}

export function Tasks() {
  const t = useTranslations();
  const tasksCopy = t.tasks;
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Finalize Q4 marketing budget',
      completed: false,
      priority: 'high',
      dueDate: new Date('2024-10-15'),
      project: 'Q4 Marketing Plan',
      assignee: 'Sarah Chen',
    },
    {
      id: '2',
      title: 'Draft the weekly progress report',
      completed: false,
      priority: 'medium',
      dueDate: new Date('2024-10-10'),
      project: '',
    },
    {
      id: '3',
      title: 'Review design mockups for new homepage',
      completed: true,
      priority: 'low',
      project: 'Website Redesign',
    },
  ]);

  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all');
  const [_searchQuery, _setSearchQuery] = useState('');
  const [_selectedTask, _setSelectedTask] = useState<Task | null>(null);

  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Paper
        sx={{
          width: 240,
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'block' },
          p: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          {tasksCopy.workspace}
        </Typography>
        <List sx={{ p: 0 }}>
          <ListItemButton selected={filter === 'all'} onClick={() => setFilter('all')}>
            <ListItemText primary={tasksCopy.allTasks} />
          </ListItemButton>
          <ListItemButton selected={filter === 'today'} onClick={() => setFilter('today')}>
            <ListItemText primary={tasksCopy.today} />
          </ListItemButton>
          <ListItemButton selected={filter === 'upcoming'} onClick={() => setFilter('upcoming')}>
            <ListItemText primary={tasksCopy.upcoming} />
          </ListItemButton>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          {tasksCopy.myProjects}
        </Typography>
        <List sx={{ p: 0 }}>
          <ListItemButton>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#9C27B0', mr: 1.5 }} />
            <ListItemText primary="Q4 Marketing Plan" />
          </ListItemButton>
          <ListItemButton>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#00C853', mr: 1.5 }} />
            <ListItemText primary="Website Redesign" />
          </ListItemButton>
          <ListItemButton>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#0B7EFF', mr: 1.5 }} />
            <ListItemText primary="Mobile App Launch" />
          </ListItemButton>
        </List>

        <Button fullWidth variant="outlined" startIcon={<Plus size={18} />} sx={{ mt: 2 }}>
          {tasksCopy.addNewList}
        </Button>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, flex: 1 }}>
              {tasksCopy.today}
            </Typography>
            <Button variant="outlined" startIcon={<Filter size={18} />} size="small">
              {tasksCopy.filter}
            </Button>
            <Button variant="contained" startIcon={<Plus size={18} />}>
              {tasksCopy.newTask}
            </Button>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder={tasksCopy.addTaskPlaceholder}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Plus size={18} />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Task List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <List sx={{ p: 2 }}>
            {tasks.map((task) => (
              <Paper key={task.id} sx={{ mb: 2, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Checkbox
                    checked={task.completed}
                    onChange={() => handleToggleTask(task.id)}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 600,
                        textDecoration: task.completed ? 'line-through' : 'none',
                        color: task.completed ? 'text.disabled' : 'text.primary',
                      }}
                    >
                      {task.title}
                    </Typography>
                    {task.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {task.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={task.priority}
                        color={getPriorityColor(task.priority) as 'default' | 'error' | 'warning'}
                        icon={<Flag size={12} />}
                      />
                      {task.dueDate && (
                        <Chip
                          size="small"
                          label={formatDate(task.dueDate)}
                          icon={<Calendar size={12} />}
                        />
                      )}
                      {task.project && (
                        <Chip size="small" label={task.project} variant="outlined" />
                      )}
                      {task.assignee && (
                        <Chip
                          size="small"
                          label={task.assignee}
                          avatar={
                            <Box
                              sx={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                bgcolor: 'primary.main',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.65rem',
                                color: 'white',
                              }}
                            >
                              {task.assignee[0]}
                            </Box>
                          }
                        />
                      )}
                    </Box>
                  </Box>
                  <IconButton size="small">
                    <MoreVertical size={18} />
                  </IconButton>
                </Box>
              </Paper>
            ))}
          </List>
        </Box>
      </Box>

      {/* Task Detail Panel (Optional) */}
      {_selectedTask && (
        <Paper
          sx={{
            width: 400,
            borderRadius: 0,
            borderLeft: 1,
            borderColor: 'divider',
            display: { xs: 'none', lg: 'block' },
            p: 3,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {tasksCopy.taskDetails}
          </Typography>
          {/* Add task details here */}
        </Paper>
      )}
    </Box>
  );
}
