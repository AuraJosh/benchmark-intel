import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, addDoc, deleteDoc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { Plus, Check, Trash2, Calendar, Target, Clock, BarChart2, MoreHorizontal, Moon, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

const Productivity = () => {
    const [tasks, setTasks] = useState([]);
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskCategory, setNewTaskCategory] = useState('');
    const [loading, setLoading] = useState(true);
    
    const prodScrollRef = useScrollRestoration('productivity-main', [loading]);

    // Date state
    const todayStr = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(todayStr);

    useEffect(() => {
        const tasksQuery = query(collection(db, 'productivityTasks'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(tasksData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const addTask = async (e) => {
        e.preventDefault();
        if (!newTaskText.trim()) return;
        const category = newTaskCategory.trim() || 'General';
        
        try {
            await addDoc(collection(db, 'productivityTasks'), {
                text: newTaskText,
                category: category,
                completed: false,
                timestamp: serverTimestamp(),
                targetDate: selectedDate, // Save with the currently selected date
            });
            setNewTaskText('');
        } catch (error) {
            console.error("Error adding task:", error);
        }
    };

    const toggleTask = async (task) => {
        try {
            await updateDoc(doc(db, 'productivityTasks', task.id), {
                completed: !task.completed
            });
        } catch (error) {
            console.error("Error updating task:", error);
        }
    };

    const deleteTask = async (taskId) => {
        try {
            await deleteDoc(doc(db, 'productivityTasks', taskId));
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };

    const changeDate = (days) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        const newDateStr = d.toISOString().split('T')[0];
        
        // Prevent going into the future
        if (newDateStr > todayStr) return;
        
        setSelectedDate(newDateStr);
    };

    const isToday = selectedDate === todayStr;

    // Filter tasks for the selected date
    // 1. Tasks where targetDate === selectedDate
    // 2. Unfinished tasks where targetDate < selectedDate (Carry over)
    const filteredTasks = tasks.filter(task => {
        // Handle old tasks that don't have targetDate yet (treat as created on their timestamp date)
        const taskDate = task.targetDate || (task.timestamp?.toDate ? task.timestamp.toDate().toISOString().split('T')[0] : null);
        
        if (!taskDate) return false;

        // If it's for today, show it
        if (taskDate === selectedDate) return true;

        // Carry over: If it's from the past and NOT completed, show it on the current view
        if (taskDate < selectedDate && !task.completed) return true;

        return false;
    });

    // Calculate Stats for the CURRENT VIEW
    const totalTasks = filteredTasks.length;
    const completedTasks = filteredTasks.filter(t => t.completed).length;
    const inProgressTasks = totalTasks - completedTasks;
    const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    const pastCategories = [...new Set(tasks.map(t => t.category).filter(Boolean))];

    // Helper to generate a consistent color based on string
    const getCategoryColor = (category) => {
        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = category.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = [
            'bg-blue-100 text-blue-700',
            'bg-purple-100 text-purple-700',
            'bg-green-100 text-green-700',
            'bg-orange-100 text-orange-700',
            'bg-pink-100 text-pink-700',
            'bg-amber-100 text-amber-700',
            'bg-indigo-100 text-indigo-700',
            'bg-teal-100 text-teal-700'
        ];
        return colors[Math.abs(hash) % colors.length];
    };

    const displayDate = new Date(selectedDate);

    return (
        <div className="w-full relative flex flex-col h-full overflow-hidden">
            <header className="mb-3 md:mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#0f172a]">Productivity</h1>
                    <p className="text-sm text-gray-500">Stay focused and get things done.</p>
                </div>
                <div className="flex bg-white items-center gap-3 px-3 py-1.5 rounded-xl shadow-sm border border-gray-100 w-full md:w-auto overflow-x-auto">
                    <button 
                        onClick={() => changeDate(-1)}
                        className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-bold text-gray-700 whitespace-nowrap">
                            {displayDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
                            {selectedDate === todayStr && <span className="ml-2 text-[10px] text-blue-500 uppercase tracking-tighter">(Today)</span>}
                        </span>
                    </div>
                    {!isToday && (
                        <button 
                            onClick={() => changeDate(1)}
                            className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </header>
            <div ref={prodScrollRef} className="flex-1 flex flex-col min-h-0 w-full overflow-x-hidden overflow-y-auto md:overflow-hidden pb-4">
                {/* Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 shrink-0">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-center">
                        <div className="absolute -right-4 -top-4 opacity-[0.03]">
                            <BarChart2 className="h-32 w-32 text-gray-900" />
                        </div>
                        <h3 className="text-gray-500 font-medium text-sm mb-4">Overall Performance</h3>
                        <div className="flex items-end gap-3 mb-2">
                            <span className="text-4xl font-bold text-gray-900">{completedTasks}</span>
                            <span className="text-gray-400 text-sm mb-1 font-medium">tasks done</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2">
                            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPercentage}%` }}></div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-gray-500 font-medium text-sm mb-1">In Progress</h3>
                                <span className="text-4xl font-bold text-gray-900">{inProgressTasks}</span>
                            </div>
                            <div className="bg-blue-50 p-2.5 rounded-xl">
                                <Target className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between items-center text-center">
                        <h3 className="text-gray-900 font-bold mb-1">Daily Goal</h3>
                        <div className="relative w-20 h-20 flex items-center justify-center mt-1">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-50" />
                                <circle 
                                    cx="40" 
                                    cy="40" 
                                    r="34" 
                                    stroke="currentColor" 
                                    strokeWidth="8" 
                                    fill="transparent" 
                                    strokeDasharray="213.6" 
                                    strokeDashoffset={213.6 - (213.6 * progressPercentage) / 100} 
                                    className="text-blue-500 transition-all duration-1000 ease-out" 
                                />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center text-center">
                                <span className="text-lg font-bold text-gray-900">{progressPercentage}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 w-full min-h-0">
                    
                    {/* Left Column - To Do List */}
                    <div className="lg:col-span-2 flex flex-col gap-4 min-h-[400px] md:min-h-0">
                        {/* Add Task Input */}
                        <div className="bg-white rounded-xl p-2 pl-4 shadow-sm border border-gray-100 flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                            <Plus className="h-5 w-5 text-gray-400 shrink-0" />
                            <input 
                                type="text" 
                                value={newTaskText}
                                onChange={(e) => setNewTaskText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTask(e)}
                                placeholder="Add a new task..." 
                                className="flex-1 min-w-[120px] bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-gray-700 py-2"
                            />
                            
                            <input 
                                list="category-options"
                                value={newTaskCategory}
                                onChange={(e) => setNewTaskCategory(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTask(e)}
                                placeholder="Category..."
                                className="w-24 sm:w-32 shrink-0 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-600 font-medium py-2 px-2 sm:px-3 focus:outline-none focus:border-blue-300 focus:ring-0"
                            />
                            <datalist id="category-options">
                                {pastCategories.map((c, i) => (
                                    <option key={i} value={c} />
                                ))}
                            </datalist>

                            <button onClick={addTask} className="bg-[#0f172a] text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shrink-0">
                                Add
                            </button>
                        </div>

                        {/* Task List */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0">
                            <h3 className="font-bold text-gray-900 mb-3 flex items-center justify-between shrink-0">
                                Tasks for Today
                                <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-1 rounded-lg">{inProgressTasks} remaining</span>
                            </h3>
                            
                            <div className="flex-1 overflow-y-auto pr-2 mini-scroll flex flex-col gap-6">
                                {loading ? (
                                    <div className="text-center py-10 text-gray-400 text-sm">Loading tasks...</div>
                                ) : filteredTasks.filter(t => !t.completed).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                                        <div className="bg-gray-50 p-4 rounded-full mb-3">
                                            <Moon className="h-8 w-8 text-gray-300" />
                                        </div>
                                        <p className="text-gray-500 font-medium">No tasks yet.</p>
                                        <p className="text-gray-400 text-sm">Add one above to get started.</p>
                                    </div>
                                ) : (
                                    Object.entries(
                                        filteredTasks.filter(t => !t.completed).reduce((acc, task) => {
                                            const cat = task.category || 'General';
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(task);
                                            return acc;
                                        }, {})
                                    ).map(([category, catTasks]) => (
                                        <div key={category} className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2 mb-1 px-1">
                                                <div className={`w-1 shadow-sm h-4 rounded-full ${getCategoryColor(category).split(' ')[0].replace('-100', '-500')}`}></div>
                                                <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400">{category}</h4>
                                                <span className="text-[10px] font-bold text-gray-300 ml-auto">{catTasks.length}</span>
                                            </div>
                                            {catTasks.map(task => {
                                                const isCarryOver = (task.targetDate || (task.timestamp?.toDate ? task.timestamp.toDate().toISOString().split('T')[0] : null)) < selectedDate;
                                                return (
                                                    <div key={task.id} className="group flex items-center justify-between p-3 bg-white hover:bg-gray-50 border border-gray-100 rounded-xl transition-all cursor-pointer shadow-sm relative overflow-hidden" onClick={() => toggleTask(task)}>
                                                        {isCarryOver && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-400"></div>}
                                                        <div className="flex items-center gap-3">
                                                            <button 
                                                                className="w-5 h-5 rounded-md border-2 border-gray-200 flex items-center justify-center hover:border-blue-500 transition-colors bg-white flex-shrink-0"
                                                            >
                                                            </button>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-gray-800">{task.text}</span>
                                                                {isCarryOver && (
                                                                    <div className="flex items-center gap-1 mt-0.5">
                                                                        <AlertCircle className="h-3 w-3 text-red-500" />
                                                                        <span className="text-[9px] font-black text-red-500 uppercase">Priority • From Previous Day</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Completed Tasks */}
                    <div className="flex flex-col gap-4 min-h-[300px] md:min-h-0">
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0">
                            <h3 className="font-bold text-gray-900 mb-3 shrink-0">Completed</h3>
                            <div className="flex-1 overflow-y-auto pr-2 mini-scroll flex flex-col gap-2">
                                {filteredTasks.filter(t => t.completed).length === 0 ? (
                                    <p className="text-sm text-gray-400 text-center py-6 h-full flex items-center justify-center">No completed tasks yet.</p>
                                ) : (
                                    filteredTasks.filter(t => t.completed).map(task => (
                                        <div key={task.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 group">
                                            <div className="flex items-center gap-3 line-through text-gray-400">
                                                <button 
                                                    onClick={() => toggleTask(task)}
                                                    className="w-5 h-5 rounded-md bg-transparent border-2 border-blue-500 text-blue-500 flex items-center justify-center flex-shrink-0"
                                                >
                                                    <Check className="h-3 w-3 text-blue-600" />
                                                </button>
                                                <span className="text-sm truncate w-32">{task.text}</span>
                                            </div>
                                            <button 
                                                onClick={() => deleteTask(task.id)}
                                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Productivity;
