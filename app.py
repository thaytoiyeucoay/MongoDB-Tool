# mongo_crud_app.py - Enhanced Version
import customtkinter as ctk
from tkinter import ttk, messagebox, simpledialog
from pymongo import MongoClient, ASCENDING, DESCENDING
from bson import ObjectId
from bson.errors import InvalidId
import json
import threading
import subprocess
import tempfile
import shutil
from pathlib import Path
import ast
import pickle
import os
import logging
from logging.handlers import RotatingFileHandler
import datetime
import time
from typing import Dict, Any, List
from collections import defaultdict
import pandas as pd

# --- Advanced Theme System ---
class ThemeManager:
    def __init__(self):
        self.themes = {
            "light": {
                "mode": "Light",
                "color_theme": "blue",
                "bg_color": "#f8f9fa",
                "fg_color": "#ffffff",
                "text_color": "#212529",
                "accent_color": "#0d6efd",
                "success_color": "#198754",
                "warning_color": "#ffc107",
                "danger_color": "#dc3545",
                "info_color": "#0dcaf0"
            },
            "dark": {
                "mode": "Dark",
                "color_theme": "dark-blue",
                "bg_color": "#1a1d23",
                "fg_color": "#2d3748",
                "text_color": "#e2e8f0",
                "accent_color": "#4299e1",
                "success_color": "#48bb78",
                "warning_color": "#ed8936",
                "danger_color": "#f56565",
                "info_color": "#38b2ac"
            },
            "cyberpunk": {
                "mode": "Dark",
                "color_theme": "dark-blue",
                "bg_color": "#0a0a0a",
                "fg_color": "#1a1a2e",
                "text_color": "#00ff41",
                "accent_color": "#ff0080",
                "success_color": "#00ff41",
                "warning_color": "#ffff00",
                "danger_color": "#ff0040",
                "info_color": "#00ffff"
            },
            "ocean": {
                "mode": "Light",
                "color_theme": "blue",
                "bg_color": "#e6f3ff",
                "fg_color": "#ffffff",
                "text_color": "#003d6b",
                "accent_color": "#0077be",
                "success_color": "#00a86b",
                "warning_color": "#ff8c00",
                "danger_color": "#dc143c",
                "info_color": "#4682b4"
            }
        }
        self.current_theme = "dark"
        self.apply_theme("dark")
    
    def apply_theme(self, theme_name: str):
        if theme_name in self.themes:
            theme = self.themes[theme_name]
            ctk.set_appearance_mode(theme["mode"])
            ctk.set_default_color_theme(theme["color_theme"])
            self.current_theme = theme_name
            return theme
        return None
    
    def get_current_theme(self) -> Dict[str, str]:
        return self.themes[self.current_theme]
    
    def get_theme_names(self) -> List[str]:
        return list(self.themes.keys())

# --- Performance Monitor ---
class PerformanceMonitor:
    def __init__(self):
        self.metrics = {
            'connection_time': [],
            'query_time': [],
            'document_count': [],
            'memory_usage': [],
            'cpu_usage': [],
            'timestamps': []
        }
        self.monitoring = False
    
    def start_monitoring(self):
        self.monitoring = True
        threading.Thread(target=self._monitor_loop, daemon=True).start()
    
    def stop_monitoring(self):
        self.monitoring = False
    
    def _monitor_loop(self):
        import random
        while self.monitoring:
            try:
                # Simulate performance data
                cpu = random.uniform(10, 80)
                memory = random.uniform(30, 70)
                
                self.metrics['cpu_usage'].append(cpu)
                self.metrics['memory_usage'].append(memory)
                self.metrics['timestamps'].append(datetime.datetime.now())
                
                # Keep only last 100 readings
                for key in self.metrics:
                    if len(self.metrics[key]) > 100:
                        self.metrics[key] = self.metrics[key][-100:]
                
                time.sleep(2)
            except Exception:
                time.sleep(5)

# Initialize global components
theme_manager = ThemeManager()
performance_monitor = PerformanceMonitor()

# --- Lớp cửa sổ Pop-up để Sửa/Thêm Document ---
class DocumentEditor(ctk.CTkInputDialog):
    def __init__(self, title, existing_json=""):
        super().__init__(text="Enter JSON content:", title=title)
        self.geometry("600x500")
        self._entry.destroy()
        self._text_label.destroy()
        ctk.CTkLabel(self, text=self.cget("title")).pack(pady=10, padx=10, anchor="w")
        self.textbox = ctk.CTkTextbox(self, width=580, height=380, font=("Courier New", 12))
        self.textbox.pack(expand=True, fill="both", padx=10)
        self.textbox.insert("1.0", existing_json)
        self._ok_button.configure(command=self._ok_event_override)

    def _ok_event_override(self):
        try:
            raw_text = self.textbox.get("1.0", "end")
            json.loads(raw_text)
            self._value = raw_text
            self.destroy()
        except json.JSONDecodeError as e:
            messagebox.showerror("Invalid JSON error", f"Please check the JSON syntax:\n\n{e}")
            self._value = None

# --- Main Application Class ---
class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("🚀 MongoDB Sync Tool Pro - Advanced Database Management")
        self.geometry("1500x900")
        self.minsize(1200, 700)
        
        # Core properties
        self.client = None
        self.current_db = None
        self.current_collection = None
        self.theme_manager = theme_manager
        self.performance_monitor = performance_monitor
        
        # URI history storage
        self.uri_history_file = "uri_history.pkl"
        self.uri_history = self.load_uri_history()

        # Saved profiles and queries
        self.profiles_file = "profiles.pkl"
        self.saved_queries_file = "saved_queries.pkl"
        self.profiles = self._load_pickle(self.profiles_file, default={})
        self.saved_queries = self._load_pickle(self.saved_queries_file, default={})

        # Logging setup
        self._setup_logging()
        
        # Setup enhanced UI
        self.setup_enhanced_ui()
        
        # Start performance monitoring
        self.performance_monitor.start_monitoring()
    
    def setup_enhanced_ui(self):
        # Configure main grid
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)
        
        # Create header with theme selector
        self.create_header()
        
        # Create main content with enhanced tabs
        self.create_main_content()
    
    def create_header(self):
        header_frame = ctk.CTkFrame(self, height=70)
        header_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=(10,5))
        header_frame.grid_columnconfigure(1, weight=1)
        header_frame.grid_propagate(False)
        
        # App title with icon
        title_frame = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_frame.grid(row=0, column=0, padx=20, pady=15, sticky="w")
        
        ctk.CTkLabel(title_frame, text="🚀 MongoDB Sync Tool Pro", 
                    font=ctk.CTkFont(size=20, weight="bold")).pack(side="left")
        
        ctk.CTkLabel(title_frame, text="Advanced Database Management", 
                    font=ctk.CTkFont(size=11), text_color="gray").pack(side="left", padx=(10,0))
        
        # Theme and controls
        controls_frame = ctk.CTkFrame(header_frame, fg_color="transparent")
        controls_frame.grid(row=0, column=1, padx=20, pady=15, sticky="e")
        
        # Theme selector
        ctk.CTkLabel(controls_frame, text="🎨 Theme:", font=ctk.CTkFont(size=11)).pack(side="left", padx=(0,5))
        
        self.theme_selector = ctk.CTkOptionMenu(
            controls_frame, 
            values=self.theme_manager.get_theme_names(),
            command=self.change_theme,
            width=100
        )
        self.theme_selector.set(self.theme_manager.current_theme)
        self.theme_selector.pack(side="left", padx=5)
        
        # Status indicator
        self.status_indicator = ctk.CTkLabel(controls_frame, text="🔴 Disconnected", 
                                           font=ctk.CTkFont(size=11))
        self.status_indicator.pack(side="left", padx=(20,0))
    
    def create_main_content(self):
        # Enhanced tab view
        self.tab_view = ctk.CTkTabview(self, corner_radius=10)
        self.tab_view.grid(row=1, column=0, padx=10, pady=(5,10), sticky="nsew")
        
        # Create enhanced tabs
        self.tab_browser = self.tab_view.add("🗄️ Management")
        self.tab_tools = self.tab_view.add("🔄 Sync")
        self.tab_analytics = self.tab_view.add("📊 Analytics")
        self.tab_performance = self.tab_view.add("⚡ Performance")
        self.tab_guide = self.tab_view.add("📚 Guide")
        self.tab_contact = self.tab_view.add("📞 Contact")
        
        # Setup tabs
        self.setup_browser_tab()
        self.setup_tools_tab()
        self.setup_analytics_tab()
        self.setup_performance_tab()
        self.setup_guide_tab()
        self.setup_contact_tab()
    
    def change_theme(self, theme_name):
        """Change application theme"""
        self.theme_manager.apply_theme(theme_name)
        messagebox.showinfo("Theme Changed", f"Theme changed to {theme_name.title()}!\nRestart the app to see full effects.")
    
    def setup_analytics_tab(self):
        """Setup analytics tab with data visualization"""
        self.tab_analytics.grid_columnconfigure(0, weight=1)
        self.tab_analytics.grid_rowconfigure(1, weight=1)
        
        # Header
        header = ctk.CTkFrame(self.tab_analytics)
        header.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
        header.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(header, text="📊 Database Analytics & Insights", 
                    font=ctk.CTkFont(size=18, weight="bold")).grid(row=0, column=0, padx=15, pady=15, sticky="w")
        
        # Refresh button
        ctk.CTkButton(header, text="🔄 Refresh Data", 
                     command=self.refresh_analytics,
                     width=120).grid(row=0, column=1, padx=15, pady=15, sticky="e")
        
        # Analytics content
        content_frame = ctk.CTkFrame(self.tab_analytics)
        content_frame.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0,10))
        content_frame.grid_columnconfigure((0,1), weight=1)
        content_frame.grid_rowconfigure((0,1), weight=1)
        
        # Database overview cards
        overview_frame = ctk.CTkFrame(content_frame)
        overview_frame.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        overview_frame.grid_columnconfigure((0,1), weight=1)
        overview_frame.grid_rowconfigure((0,1), weight=1)
        
        ctk.CTkLabel(overview_frame, text="📈 Database Overview", 
                    font=ctk.CTkFont(size=14, weight="bold")).grid(row=0, column=0, columnspan=2, pady=10)
        
        # Performance frame
        perf_frame = ctk.CTkFrame(content_frame)
        perf_frame.grid(row=1, column=0, columnspan=2, sticky="nsew", padx=5, pady=5)
        
        ctk.CTkLabel(perf_frame, text="⚡ Query Performance Insights", 
                    font=ctk.CTkFont(size=14, weight="bold")).pack(pady=10)
        
        perf_content = ctk.CTkTextbox(perf_frame, height=150)
        perf_content.pack(fill="both", expand=True, padx=10, pady=(0,10))
        perf_content.insert("1.0", "⚡ Performance metrics will be displayed here:\n\n"
                                   "• Average query execution time\n"
                                   "• Most frequently accessed collections\n"
                                   "• Index efficiency recommendations\n"
                                   "• Connection pool statistics")
        perf_content.configure(state="disabled")
    
    def setup_performance_tab(self):
        """Setup performance monitoring tab"""
        self.tab_performance.grid_columnconfigure(0, weight=1)
        self.tab_performance.grid_rowconfigure(1, weight=1)
        
        # Header
        header = ctk.CTkFrame(self.tab_performance)
        header.grid(row=0, column=0, sticky="ew", padx=10, pady=10)
        header.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(header, text="⚡ Real-time Performance Monitor", 
                    font=ctk.CTkFont(size=18, weight="bold")).grid(row=0, column=0, padx=15, pady=15, sticky="w")
        
        # Control buttons
        control_frame = ctk.CTkFrame(header, fg_color="transparent")
        control_frame.grid(row=0, column=1, padx=15, pady=15, sticky="e")
        
        self.start_monitor_btn = ctk.CTkButton(control_frame, text="▶️ Start", width=80, 
                                              command=self.start_monitoring)
        self.start_monitor_btn.pack(side="left", padx=5)
        
        self.stop_monitor_btn = ctk.CTkButton(control_frame, text="⏹️ Stop", width=80,
                                             command=self.stop_monitoring, state="disabled")
        self.stop_monitor_btn.pack(side="left", padx=5)
        
        # Performance content
        content_frame = ctk.CTkFrame(self.tab_performance)
        content_frame.grid(row=1, column=0, sticky="nsew", padx=10, pady=(0,10))
        content_frame.grid_columnconfigure((0,1), weight=1)
        content_frame.grid_rowconfigure((0,1), weight=1)
        
        # System metrics
        metrics_frame = ctk.CTkFrame(content_frame)
        metrics_frame.grid(row=0, column=0, sticky="nsew", padx=5, pady=5)
        metrics_frame.grid_columnconfigure((0,1), weight=1)
        metrics_frame.grid_rowconfigure((0,1,2), weight=1)
        
        ctk.CTkLabel(metrics_frame, text="🖥️ System Metrics", 
                    font=ctk.CTkFont(size=14, weight="bold")).grid(row=0, column=0, columnspan=2, pady=10)
        
        # CPU and Memory cards
        self.cpu_card = self.create_metric_card(metrics_frame, "🖥️ CPU Usage", "0%", "#4299e1", row=1, col=0)
        self.memory_card = self.create_metric_card(metrics_frame, "💾 Memory Usage", "0%", "#48bb78", row=1, col=1)
        
        # Real-time chart placeholder
        chart_frame = ctk.CTkFrame(content_frame)
        chart_frame.grid(row=0, column=1, sticky="nsew", padx=5, pady=5)
        
        ctk.CTkLabel(chart_frame, text="📈 Real-time Performance Chart", 
                    font=ctk.CTkFont(size=14, weight="bold")).pack(pady=10)
        
        chart_placeholder = ctk.CTkTextbox(chart_frame, height=200)
        chart_placeholder.pack(fill="both", expand=True, padx=10, pady=(0,10))
        chart_placeholder.insert("1.0", "📈 Real-time performance chart will appear here\n\n"
                                         "Click 'Start' to begin monitoring:\n"
                                         "• CPU usage over time\n"
                                         "• Memory consumption\n"
                                         "• Database connection metrics\n"
                                         "• Query response times")
        chart_placeholder.configure(state="disabled")
        
        # Database metrics
        db_metrics_frame = ctk.CTkFrame(content_frame)
        db_metrics_frame.grid(row=1, column=0, columnspan=2, sticky="nsew", padx=5, pady=5)
        
        ctk.CTkLabel(db_metrics_frame, text="🗄️ Database Performance Metrics", 
                    font=ctk.CTkFont(size=14, weight="bold")).pack(pady=10)
        
        db_content = ctk.CTkTextbox(db_metrics_frame, height=150)
        db_content.pack(fill="both", expand=True, padx=10, pady=(0,10))
        db_content.insert("1.0", "🗄️ Database performance metrics:\n\n"
                                 "• Active connections: 0\n"
                                 "• Average query time: 0ms\n"
                                 "• Operations per second: 0\n"
                                 "• Cache hit ratio: 0%\n"
                                 "• Lock wait time: 0ms")
        db_content.configure(state="disabled")
        
        # Start updating performance metrics
        self.update_performance_display()
    
    def create_metric_card(self, parent, title, value, color, row=0, col=0):
        """Create a metric display card"""
        card = ctk.CTkFrame(parent)
        card.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
        card.grid_columnconfigure(0, weight=1)
        
        ctk.CTkLabel(card, text=title, font=ctk.CTkFont(size=11)).grid(row=0, column=0, pady=(10,5))
        
        value_label = ctk.CTkLabel(card, text=value, font=ctk.CTkFont(size=20, weight="bold"),
                                  text_color=color)
        value_label.grid(row=1, column=0, pady=(0,10))
        
        # Store reference for updates
        card.value_label = value_label
        return card
    
    def start_monitoring(self):
        """Start performance monitoring"""
        self.performance_monitor.start_monitoring()
        self.start_monitor_btn.configure(state="disabled")
        self.stop_monitor_btn.configure(state="normal")
        messagebox.showinfo("Monitoring Started", "Performance monitoring is now active!")
    
    def stop_monitoring(self):
        """Stop performance monitoring"""
        self.performance_monitor.stop_monitoring()
        self.start_monitor_btn.configure(state="normal")
        self.stop_monitor_btn.configure(state="disabled")
        messagebox.showinfo("Monitoring Stopped", "Performance monitoring has been stopped.")
    
    def update_performance_display(self):
        """Update performance metrics display"""
        try:
            metrics = self.performance_monitor.metrics
            
            if metrics['cpu_usage'] and hasattr(self, 'cpu_card'):
                cpu_current = metrics['cpu_usage'][-1]
                memory_current = metrics['memory_usage'][-1]
                
                # Update metric cards
                self.cpu_card.value_label.configure(text=f"{cpu_current:.1f}%")
                self.memory_card.value_label.configure(text=f"{memory_current:.1f}%")
        
        except Exception as e:
            print(f"Performance display update error: {e}")
        
        # Schedule next update
        self.after(3000, self.update_performance_display)
    
    def refresh_analytics(self):
        """Refresh analytics data"""
        if not self.client:
            messagebox.showwarning("No Connection", "Please connect to a database first.")
            return
        
        try:
            # Get database stats
            db_names = self.client.list_database_names()
            total_collections = 0
            
            for db_name in db_names:
                if db_name not in ["admin", "config", "local"]:
                    collections = self.client[db_name].list_collection_names()
                    total_collections += len(collections)
            
            messagebox.showinfo("Analytics Updated", 
                              f"Found {len(db_names)} databases with {total_collections} collections total.")
        
        except Exception as e:
            messagebox.showerror("Analytics Error", f"Failed to refresh analytics: {e}")

    def setup_browser_tab(self):
        # Configure the overall layout
        self.tab_browser.grid_columnconfigure(1, weight=3)
        self.tab_browser.grid_columnconfigure(2, weight=2)
        self.tab_browser.grid_rowconfigure(1, weight=1)
        
        # Connection Frame at the top
        self.connect_frame = ctk.CTkFrame(self.tab_browser, corner_radius=0, fg_color="transparent")
        self.connect_frame.grid(row=0, column=0, columnspan=3, sticky="ew", padx=10, pady=5)
        self.connect_frame.grid_columnconfigure(1, weight=1)
        
        # Title and connection UI in the same row
        title_label = ctk.CTkLabel(self.connect_frame, 
                                 text="MongoDB Browser - KHANH DUY BUI",
                                 font=ctk.CTkFont(size=20, weight="bold"))
        title_label.grid(row=0, column=0, padx=10, pady=(5,10), sticky="w")
        
        # Connection controls
        connection_controls = ctk.CTkFrame(self.connect_frame, fg_color="transparent")
        connection_controls.grid(row=0, column=1, sticky="e", padx=10)
        connection_controls.grid_columnconfigure(0, weight=1)
        
        # URI input with auth controls
        uri_frame = ctk.CTkFrame(connection_controls, fg_color="transparent")
        uri_frame.grid(row=0, column=0, padx=(0, 5), pady=5, sticky="ew")
        uri_frame.grid_columnconfigure(0, weight=1)
        
        self.uri_entry = ctk.CTkEntry(uri_frame, placeholder_text="MongoDB Connection URI", width=300)
        self.uri_entry.grid(row=0, column=0, padx=(0, 5), pady=5, sticky="ew")
        self.uri_entry.insert(0, "mongodb://localhost:27017")
        self.uri_entry.bind("<KeyRelease>", self.on_uri_changed)
        
        # Auth controls
        auth_frame = ctk.CTkFrame(uri_frame, fg_color="transparent")
        auth_frame.grid(row=1, column=0, padx=(0, 5), pady=(0, 5), sticky="ew")
        auth_frame.grid_columnconfigure(1, weight=1)
        
        self.has_auth_var = ctk.BooleanVar(value=False)
        self.has_auth_checkbox = ctk.CTkCheckBox(auth_frame, text="URI có mật khẩu", 
                                               variable=self.has_auth_var,
                                               command=self.toggle_auth_source)
        self.has_auth_checkbox.grid(row=0, column=0, padx=(0, 10), pady=2, sticky="w")
        
        self.auth_source_entry = ctk.CTkEntry(auth_frame, placeholder_text="Auth Source (e.g., admin)", width=200)
        self.auth_source_entry.grid(row=0, column=1, padx=(0, 5), pady=2, sticky="ew")
        self.auth_source_entry.insert(0, "admin")
        self.auth_source_entry.configure(state="disabled")
        
        # Profiles & Recent URIs row
        profiles_row = ctk.CTkFrame(uri_frame, fg_color="transparent")
        profiles_row.grid(row=2, column=0, sticky="ew")
        profiles_row.grid_columnconfigure(1, weight=1)

        self.uri_history_var = ctk.StringVar()
        self.uri_history_dropdown = ctk.CTkOptionMenu(profiles_row, 
                                                    values=["Recent URIs..."] + self.uri_history,
                                                    variable=self.uri_history_var,
                                                    command=self.on_uri_history_select,
                                                    width=180)
        self.uri_history_dropdown.grid(row=0, column=0, padx=(0, 8), pady=(0, 5), sticky="w")

        self.profiles_var = ctk.StringVar(value="Profiles…")
        self.profiles_dropdown = ctk.CTkOptionMenu(profiles_row,
                                                  values=["Profiles…"] + list(self.profiles.keys()),
                                                  variable=self.profiles_var,
                                                  command=self.on_profile_select,
                                                  width=180)
        self.profiles_dropdown.grid(row=0, column=1, padx=(0, 8), pady=(0, 5), sticky="w")

        self.save_profile_btn = ctk.CTkButton(profiles_row, text="💾 Save Profile", width=140, command=self.save_current_profile)
        self.save_profile_btn.grid(row=0, column=2, padx=(0, 0), pady=(0, 5), sticky="e")
        
        # Initialize with default URI
        if self.uri_history:
            self.uri_entry.delete(0, 'end')
            self.uri_entry.insert(0, self.uri_history[0])
        
        self.connect_button = ctk.CTkButton(connection_controls, text="🔌 Connect", width=120, command=self.connect_to_db)
        self.connect_button.grid(row=0, column=1, padx=(5, 0), pady=5)
        
        # Sidebar for database tree
        self.sidebar_frame = ctk.CTkFrame(self.tab_browser, width=250)
        self.sidebar_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(1, weight=1)
        
        # Collection management buttons
        self.collection_actions = ctk.CTkFrame(self.sidebar_frame, fg_color="transparent")
        self.collection_actions.grid(row=0, column=0, padx=5, pady=(5,0), sticky="ew")
        self.collection_actions.grid_columnconfigure((0,1), weight=1)
        
        # Stats button frame
        self.stats_frame = ctk.CTkFrame(self.collection_actions, fg_color="transparent")
        self.stats_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0,5))
        self.stats_frame.grid_columnconfigure((0,1), weight=1)
        
        self.db_stats_btn = ctk.CTkButton(self.stats_frame, 
                                       text="📊 Database Stats",
                                       command=self.show_db_stats,
                                       height=32,
                                       fg_color="#17a2b8",
                                       hover_color="#138496")
        self.db_stats_btn.grid(row=0, column=0, padx=2, pady=5, sticky="ew")
        
        self.col_stats_btn = ctk.CTkButton(self.stats_frame, 
                                        text="📈 Collection Stats",
                                        command=self.show_collection_stats,
                                        height=32,
                                        fg_color="#17a2b8",
                                        hover_color="#138496")
        self.col_stats_btn.grid(row=0, column=1, padx=2, pady=5, sticky="ew")
        
        self.create_col_btn = ctk.CTkButton(self.collection_actions, text="Add Collection", 
                                          command=self.create_collection,
                                          height=32,
                                          fg_color="#28a745", 
                                          hover_color="#218838")
        self.create_col_btn.grid(row=1, column=0, padx=2, pady=5, sticky="ew")
        
        self.delete_col_btn = ctk.CTkButton(self.collection_actions, text="Drop Collection",
                                          command=self.delete_collection,
                                          height=32,
                                          fg_color="#dc3545",
                                          hover_color="#c82333")
        self.delete_col_btn.grid(row=1, column=1, padx=2, pady=5, sticky="ew")
        
        self.db_tree = ttk.Treeview(self.sidebar_frame, show="tree headings")
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", 
                     background="#2b2b2b", 
                     foreground="#ffffff", 
                     fieldbackground="#2b2b2b", 
                     borderwidth=0, 
                     rowheight=28)
        style.map('Treeview', 
                background=[('selected', '#1f6aa5')],
                foreground=[('selected', '#ffffff')])
        self.db_tree.grid(row=1, column=0, sticky='nsew', padx=5, pady=5)
        self.db_tree.bind("<<TreeviewSelect>>", self.on_collection_select)
        self.db_tree.bind("<<TreeviewOpen>>", self.on_db_open)
        self.main_frame = ctk.CTkFrame(self.tab_browser)
        self.main_frame.grid(row=1, column=1, padx=5, pady=5, sticky="nsew")
        self.main_frame.grid_columnconfigure(0, weight=1)
        self.main_frame.grid_rowconfigure(2, weight=1)
        self.main_frame.grid_rowconfigure(5, weight=20)
        self.doc_action_frame = ctk.CTkFrame(self.main_frame, fg_color="transparent")
        self.doc_action_frame.grid(row=0, column=0, padx=5, pady=5, sticky="ew")
        self.doc_action_frame.grid_columnconfigure(0, weight=1)
        # Simple filter frame with improved styling
        filter_section = ctk.CTkFrame(self.doc_action_frame)
        filter_section.grid(row=0, column=0, padx=5, pady=5, sticky="ew")
        filter_section.grid_columnconfigure(1, weight=1)

        # Title for filter section
        ctk.CTkLabel(filter_section, 
                    text="Search Documents",
                    font=ctk.CTkFont(size=14, weight="bold")).grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky="w")

        # Simple filter controls
        self.simple_filter_frame = ctk.CTkFrame(filter_section, fg_color="transparent")
        self.simple_filter_frame.grid(row=1, column=0, columnspan=3, padx=5, pady=5, sticky="ew")
        self.simple_filter_frame.grid_columnconfigure(1, weight=1)
        
        self.filter_field = ctk.CTkEntry(self.simple_filter_frame, 
                                       placeholder_text="Field's name (e.g: gender)",
                                       height=35)
        self.filter_field.grid(row=0, column=0, padx=5)
        
        self.filter_value = ctk.CTkEntry(self.simple_filter_frame,
                                       placeholder_text="Field's value",
                                       height=35)
        self.filter_value.grid(row=0, column=1, padx=5, sticky="ew")
        
        self.apply_filter_btn = ctk.CTkButton(self.simple_filter_frame,
                                            text="🔍 Search",
                                            width=80,
                                            height=35,
                                            command=self.apply_filter,
                                            fg_color="#007bff",
                                            hover_color="#0056b3")
        self.apply_filter_btn.grid(row=0, column=2, padx=5)
        # Delete matched documents by simple filter
        self.delete_filter_btn = ctk.CTkButton(
            self.simple_filter_frame,
            text="🗑️ Delete matched",
            width=140,
            height=35,
            command=self.delete_documents_by_filter,
            fg_color="#dc3545",
            hover_color="#c82333"
        )
        self.delete_filter_btn.grid(row=0, column=3, padx=5)

        # Pagination, sort and projection controls
        pager_row = ctk.CTkFrame(self.simple_filter_frame, fg_color="transparent")
        pager_row.grid(row=1, column=0, columnspan=3, padx=5, pady=(4,0), sticky="ew")
        pager_row.grid_columnconfigure(7, weight=1)

        ctk.CTkLabel(pager_row, text="Page:").grid(row=0, column=0, padx=(0,4))
        self.page_var = ctk.IntVar(value=1)
        self.page_entry = ctk.CTkEntry(pager_row, width=60)
        self.page_entry.insert(0, "1")
        self.page_entry.grid(row=0, column=1)

        ctk.CTkLabel(pager_row, text="Page Size:").grid(row=0, column=2, padx=(12,4))
        self.page_size_entry = ctk.CTkEntry(pager_row, width=80)
        self.page_size_entry.insert(0, "50")
        self.page_size_entry.grid(row=0, column=3)

        ctk.CTkLabel(pager_row, text="Sort:").grid(row=0, column=4, padx=(12,4))
        self.sort_field_entry = ctk.CTkEntry(pager_row, width=120, placeholder_text="field")
        self.sort_field_entry.grid(row=0, column=5)
        self.sort_dir_dropdown = ctk.CTkOptionMenu(pager_row, values=["ASC", "DESC"], width=70)
        self.sort_dir_dropdown.set("ASC")
        self.sort_dir_dropdown.grid(row=0, column=6, padx=(4,0))

        ctk.CTkLabel(pager_row, text="Projection:").grid(row=0, column=8, padx=(12,4))
        self.projection_entry = ctk.CTkEntry(pager_row, placeholder_text="{""name"":1, ""age"":1}")
        self.projection_entry.grid(row=0, column=9, sticky="ew")

        # Advanced filter with label
        ctk.CTkLabel(filter_section,
                    text="Advanced Search",
                    font=("Arial", 12)).grid(row=2, column=0, columnspan=3, padx=5, pady=(10,0), sticky="w")
        
        self.filter_entry = ctk.CTkEntry(filter_section,
                                       placeholder_text="Filter JSON (Ví dụ: {\"age\": {\"$gt\": 25}})",
                                       height=35)
        self.filter_entry.grid(row=3, column=0, columnspan=3, padx=5, pady=5, sticky="ew")
        self.filter_entry.bind("<Return>", self.apply_filter)
        
        # Document actions
        action_frame = ctk.CTkFrame(self.doc_action_frame)
        action_frame.grid(row=1, column=0, padx=5, pady=(10,5), sticky="ew")
        action_frame.grid_columnconfigure(0, weight=1)
        
        self.add_doc_button = ctk.CTkButton(action_frame,
                                          text="➕ Create New Document",
                                          height=35,
                                          command=self.add_document,
                                          fg_color="#28a745",
                                          hover_color="#218838")
        self.add_doc_button.grid(row=0, column=1, padx=(5,0))

        # Saved queries controls
        self.saved_query_var = ctk.StringVar(value="Saved queries…")
        self.saved_query_dropdown = ctk.CTkOptionMenu(action_frame, values=["Saved queries…"] + list(self.saved_queries.get("global", {}).keys()), variable=self.saved_query_var, command=self.on_saved_query_select, width=180)
        self.saved_query_dropdown.grid(row=0, column=0, padx=(0,5), sticky="w")
        self.save_query_btn = ctk.CTkButton(action_frame, text="💾 Save query", width=120, command=self.save_current_query)
        self.save_query_btn.grid(row=0, column=2, padx=(5,0))
        
        # Export button with advanced options
        export_button = ctk.CTkButton(action_frame, text="📤 Advanced Export", command=self.show_advanced_export)
        export_button.grid(row=0, column=3, padx=5, pady=5, sticky="ew")
        
        self.documents_tree = ttk.Treeview(self.main_frame, columns=("ID", "Content"), show="headings")
        self.documents_tree.heading("ID", text="Document ID")
        self.documents_tree.heading("Content", text="Content Preview")
        self.documents_tree.column("ID", width=220)
        self.documents_tree.grid(row=2, column=0, padx=5, pady=5, sticky="nsew")
        self.documents_tree.bind("<Double-1>", self.edit_document)
        self.documents_tree.bind("<<TreeviewSelect>>", self.on_document_select)
        self.delete_doc_button = ctk.CTkButton(self.main_frame, text="Drop Selected Document", fg_color="#D32F2F", hover_color="#B71C1C", command=self.delete_document)
        self.delete_doc_button.grid(row=3, column=0, padx=5, pady=10, sticky="ew")
        ctk.CTkLabel(self.main_frame, text="Document Detail View", font=ctk.CTkFont(size=16, weight="bold")).grid(row=4, column=0, padx=5, pady=(15,5), sticky="sw")
        self.document_detail_textbox = ctk.CTkTextbox(self.main_frame, wrap="word", state="disabled", font=("Courier New", 14), height=600, width=800)
        self.document_detail_textbox.grid(row=5, column=0, sticky="nsew", padx=10, pady=10)
        self.index_frame = ctk.CTkFrame(self.tab_browser, width=350)
        self.index_frame.grid(row=1, column=2, padx=5, pady=5, sticky="nsew")
        self.index_frame.grid_rowconfigure(2, weight=1)
        self.index_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(self.index_frame, text="Indexes", font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=0, columnspan=2, pady=10)
        self.index_list = ctk.CTkTextbox(self.index_frame, wrap="word", state="disabled", font=("Courier New", 12))
        self.index_list.grid(row=2, column=0, sticky="nsew", padx=5, pady=5)
        # Add index instruction label
        instruction_text = (
            "Instructions for deleting an index:\n"
            "1. Copy the index name from the list above\n"
            "2. Paste it into the box below\n"
            "3. Click the 'Drop Index' button to delete\n\n"
            "Note: '_id_' is the default index and cannot be deleted"
        )
        self.index_instruction = ctk.CTkLabel(self.index_frame, text=instruction_text, justify="left")
        self.index_instruction.grid(row=3, column=0, padx=5, pady=(10,5), sticky="w")

        self.drop_index_entry = ctk.CTkEntry(self.index_frame, placeholder_text="Enter index name to delete (e.g., email_1)")
        self.drop_index_entry.grid(row=4, column=0, padx=5, pady=5, sticky="ew")
        self.drop_index_button = ctk.CTkButton(self.index_frame, text="Drop Index", fg_color="#D32F2F", hover_color="#B71C1C", command=self.drop_index)
        self.drop_index_button.grid(row=5, column=0, padx=5, pady=5, sticky="ew")

    def setup_tools_tab(self):
        self.tab_tools.grid_columnconfigure(0, weight=1)
        self.tab_tools.grid_rowconfigure(3, weight=1)  # For log frame

        # Sync Method Selector
        method_frame = ctk.CTkFrame(self.tab_tools)
        method_frame.grid(row=0, column=0, padx=10, pady=(10,0), sticky="ew")
        method_frame.grid_columnconfigure(0, weight=1)
        method_frame.grid_columnconfigure(1, weight=1)

        # Online Sync Button
        self.online_sync_btn = ctk.CTkButton(
            method_frame,
            text="💻 Online Sync",
            command=lambda: self.show_sync_panel("online"),
            height=35,
            font=ctk.CTkFont(size=13),
            fg_color="#007bff",
            hover_color="#0056b3"
        )
        self.online_sync_btn.grid(row=0, column=0, padx=5, pady=10, sticky="ew")

        # Offline Sync Button
        self.offline_sync_btn = ctk.CTkButton(
            method_frame,
            text="💾 Offline Sync",
            command=lambda: self.show_sync_panel("offline"),
            height=35,
            font=ctk.CTkFont(size=13),
            fg_color="#28a745",
            hover_color="#218838"
        )
        self.offline_sync_btn.grid(row=0, column=1, padx=5, pady=10, sticky="ew")

        # Online Sync Frame
        self.online_sync_frame = ctk.CTkFrame(self.tab_tools)
        self.online_sync_frame.grid(row=1, column=0, padx=10, pady=10, sticky="new")
        self.online_sync_frame.grid_columnconfigure(1, weight=1)

        # Online Sync Content
        ctk.CTkLabel(self.online_sync_frame, text="Online Sync", 
                    font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=0, columnspan=2, pady=10)
        
        # Source section
        source_frame = ctk.CTkFrame(self.online_sync_frame)
        source_frame.grid(row=1, column=0, columnspan=2, padx=10, pady=5, sticky="ew")
        source_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(source_frame, text="🔄 Source", font=("", 13, "bold")).grid(row=0, column=0, columnspan=2, pady=5, sticky="w")
        ctk.CTkLabel(source_frame, text="URI:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        
        # Source URI with auth controls
        source_uri_frame = ctk.CTkFrame(source_frame, fg_color="transparent")
        source_uri_frame.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        source_uri_frame.grid_columnconfigure(0, weight=1)
        
        self.sync_source_uri = ctk.CTkEntry(source_uri_frame, placeholder_text="mongodb://localhost:27017")
        self.sync_source_uri.grid(row=0, column=0, padx=(0, 5), pady=0, sticky="ew")
        self.sync_source_uri.insert(0, "mongodb://localhost:27017")
        
        self.sync_source_auth_var = ctk.BooleanVar(value=False)
        self.sync_source_auth_checkbox = ctk.CTkCheckBox(source_uri_frame, text="Auth", 
                                                       variable=self.sync_source_auth_var,
                                                       width=60)
        self.sync_source_auth_checkbox.grid(row=0, column=1, padx=(0, 5), pady=0, sticky="w")
        
        self.sync_source_auth_source = ctk.CTkEntry(source_uri_frame, placeholder_text="authSource", width=100)
        self.sync_source_auth_source.grid(row=0, column=2, padx=(0, 5), pady=0, sticky="ew")
        self.sync_source_auth_source.insert(0, "admin")
        self.sync_source_auth_source.configure(state="disabled")
        
        # Source auth controls row
        source_auth_frame = ctk.CTkFrame(source_frame, fg_color="transparent")
        source_auth_frame.grid(row=3, column=1, padx=10, pady=(0, 5), sticky="ew")
        source_auth_frame.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(source_auth_frame, text="Auth Source:").grid(row=0, column=0, padx=(0, 5), pady=2, sticky="w")
        self.sync_source_auth_source_full = ctk.CTkEntry(source_auth_frame, placeholder_text="e.g., admin", width=150)
        self.sync_source_auth_source_full.grid(row=0, column=1, padx=(0, 5), pady=2, sticky="ew")
        self.sync_source_auth_source_full.insert(0, "admin")
        self.sync_source_auth_source_full.configure(state="disabled")
        
        # Bind checkbox to enable/disable auth source
        self.sync_source_auth_var.trace("w", lambda *args: self.toggle_sync_auth_source("source"))
        
        ctk.CTkLabel(source_frame, text="Database:").grid(row=2, column=0, padx=10, pady=5, sticky="w")
        self.sync_source_db = ctk.CTkEntry(source_frame, placeholder_text="Source DB")
        self.sync_source_db.grid(row=2, column=1, padx=10, pady=5, sticky="ew")

        # Destination section
        dest_frame = ctk.CTkFrame(self.online_sync_frame)
        dest_frame.grid(row=2, column=0, columnspan=2, padx=10, pady=5, sticky="ew")
        dest_frame.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(dest_frame, text="🎯 Destination", font=("", 13, "bold")).grid(row=0, column=0, columnspan=2, pady=5, sticky="w")
        ctk.CTkLabel(dest_frame, text="URI:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        
        # Destination URI with auth controls
        dest_uri_frame = ctk.CTkFrame(dest_frame, fg_color="transparent")
        dest_uri_frame.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        dest_uri_frame.grid_columnconfigure(0, weight=1)
        
        self.sync_dest_uri = ctk.CTkEntry(dest_uri_frame, placeholder_text="mongodb://user:pass@host")
        self.sync_dest_uri.grid(row=0, column=0, padx=(0, 5), pady=0, sticky="ew")
        
        self.sync_dest_auth_var = ctk.BooleanVar(value=False)
        self.sync_dest_auth_checkbox = ctk.CTkCheckBox(dest_uri_frame, text="Auth", 
                                                      variable=self.sync_dest_auth_var,
                                                      width=60)
        self.sync_dest_auth_checkbox.grid(row=0, column=1, padx=(0, 5), pady=0, sticky="w")
        
        self.sync_dest_auth_source = ctk.CTkEntry(dest_uri_frame, placeholder_text="authSource", width=100)
        self.sync_dest_auth_source.grid(row=0, column=2, padx=(0, 5), pady=0, sticky="ew")
        self.sync_dest_auth_source.insert(0, "admin")
        self.sync_dest_auth_source.configure(state="disabled")
        
        # Destination auth controls row
        dest_auth_frame = ctk.CTkFrame(dest_frame, fg_color="transparent")
        dest_auth_frame.grid(row=2, column=1, padx=10, pady=(0, 5), sticky="ew")
        dest_auth_frame.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(dest_auth_frame, text="Auth Source:").grid(row=0, column=0, padx=(0, 5), pady=2, sticky="w")
        self.sync_dest_auth_source_full = ctk.CTkEntry(dest_auth_frame, placeholder_text="e.g., admin", width=150)
        self.sync_dest_auth_source_full.grid(row=0, column=1, padx=(0, 5), pady=2, sticky="ew")
        self.sync_dest_auth_source_full.insert(0, "admin")
        self.sync_dest_auth_source_full.configure(state="disabled")
        
        # Bind checkbox to enable/disable auth source
        self.sync_dest_auth_var.trace("w", lambda *args: self.toggle_sync_auth_source("dest"))
        
        ctk.CTkLabel(dest_frame, text="Database:").grid(row=3, column=0, padx=10, pady=5, sticky="w")
        self.sync_dest_db = ctk.CTkEntry(dest_frame, placeholder_text="Destination DB")
        self.sync_dest_db.grid(row=3, column=1, padx=10, pady=5, sticky="ew")

        self.sync_button = ctk.CTkButton(self.online_sync_frame, 
                                       text="🚀 Start Sync",
                                       command=self.start_sync_process,
                                       height=35,
                                       font=ctk.CTkFont(size=13))
        self.sync_button.grid(row=3, column=0, columnspan=2, padx=10, pady=10, sticky="ew")

        # Offline Sync Frame
        self.offline_sync_frame = ctk.CTkFrame(self.tab_tools)
        self.offline_sync_frame.grid(row=1, column=0, padx=10, pady=10, sticky="new")
        self.offline_sync_frame.grid_columnconfigure(1, weight=1)
        self.offline_sync_frame.grid_columnconfigure(0, weight=1)

        # Offline Sync Content
        ctk.CTkLabel(self.offline_sync_frame, text="Offline Sync", 
                    font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=0, columnspan=2, pady=10)

        # Export Frame
        export_frame = ctk.CTkFrame(self.offline_sync_frame)
        export_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")
        export_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(export_frame, text="📤 Export data", font=("", 13, "bold")).grid(row=0, column=0, columnspan=2, pady=5, sticky="w")
        ctk.CTkLabel(export_frame, text="Source URI:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        
        # Export URI with auth controls
        export_uri_frame = ctk.CTkFrame(export_frame, fg_color="transparent")
        export_uri_frame.grid(row=1, column=1, padx=10, pady=5, sticky="ew")
        export_uri_frame.grid_columnconfigure(0, weight=1)
        
        self.export_uri = ctk.CTkEntry(export_uri_frame, placeholder_text="mongodb://localhost:27017")
        self.export_uri.grid(row=0, column=0, padx=(0, 5), pady=0, sticky="ew")
        self.export_uri.insert(0, "mongodb://localhost:27017")
        
        self.export_auth_var = ctk.BooleanVar(value=False)
        self.export_auth_checkbox = ctk.CTkCheckBox(export_uri_frame, text="Auth", 
                                                   variable=self.export_auth_var,
                                                   width=60)
        self.export_auth_checkbox.grid(row=0, column=1, padx=(0, 5), pady=0, sticky="w")
        
        self.export_auth_source = ctk.CTkEntry(export_uri_frame, placeholder_text="authSource", width=100)
        self.export_auth_source.grid(row=0, column=2, padx=(0, 5), pady=0, sticky="ew")
        self.export_auth_source.insert(0, "admin")
        self.export_auth_source.configure(state="disabled")
        
        # Export auth controls row
        export_auth_frame = ctk.CTkFrame(export_frame, fg_color="transparent")
        export_auth_frame.grid(row=2, column=1, padx=10, pady=(0, 5), sticky="ew")
        export_auth_frame.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(export_auth_frame, text="Auth Source:").grid(row=0, column=0, padx=(0, 5), pady=2, sticky="w")
        self.export_auth_source_full = ctk.CTkEntry(export_auth_frame, placeholder_text="e.g., admin", width=150)
        self.export_auth_source_full.grid(row=0, column=1, padx=(0, 5), pady=2, sticky="ew")
        self.export_auth_source_full.insert(0, "admin")
        self.export_auth_source_full.configure(state="disabled")
        
        # Bind checkbox to enable/disable auth source
        self.export_auth_var.trace("w", lambda *args: self.toggle_export_auth_source())
        
        # Select collections to export
        ctk.CTkLabel(export_frame, text="Source DB:").grid(row=3, column=0, padx=10, pady=(10,5), sticky="w")
        self.export_db = ctk.CTkEntry(export_frame, placeholder_text="Source DB")
        self.export_db.grid(row=3, column=1, padx=10, pady=(10,5), sticky="ew")

        ctk.CTkLabel(export_frame, text="Collections (optional):").grid(row=4, column=0, padx=10, pady=5, sticky="nw")
        self.export_collections = ctk.CTkTextbox(export_frame, height=70)
        self.export_collections.grid(row=4, column=1, padx=10, pady=5, sticky="ew")
        hint = "One per line. Leave empty to export entire DB. Example:\nusers\norders\nproducts"
        self.export_collections.insert("1.0", hint)
        self.export_collections.configure(state="normal")

        self.export_button = ctk.CTkButton(export_frame, 
                                         text="💾 Export to ZIP file",
                                         command=self.start_export_process,
                                         height=35,
                                         font=ctk.CTkFont(size=13))
        self.export_button.grid(row=5, column=0, columnspan=2, padx=10, pady=10, sticky="ew")

        # Import Frame
        import_frame = ctk.CTkFrame(self.offline_sync_frame)
        import_frame.grid(row=1, column=1, padx=5, pady=5, sticky="nsew")
        import_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(import_frame, text="📥 Import data", font=("", 13, "bold")).grid(row=0, column=0, columnspan=2, pady=5, sticky="w")
        
        self.import_file_button = ctk.CTkButton(import_frame, 
                                              text="📂 Select ZIP file",
                                              command=self.choose_import_file,
                                              height=35,
                                              font=ctk.CTkFont(size=13))
        self.import_file_button.grid(row=1, column=0, columnspan=2, padx=10, pady=5, sticky="ew")

        ctk.CTkLabel(import_frame, text="Dest URI:").grid(row=2, column=0, padx=10, pady=5, sticky="w")
        
        # Import URI with auth controls
        import_uri_frame = ctk.CTkFrame(import_frame, fg_color="transparent")
        import_uri_frame.grid(row=2, column=1, padx=10, pady=5, sticky="ew")
        import_uri_frame.grid_columnconfigure(0, weight=1)
        
        self.import_uri = ctk.CTkEntry(import_uri_frame, placeholder_text="mongodb://user:pass@host")
        self.import_uri.grid(row=0, column=0, padx=(0, 5), pady=0, sticky="ew")
        
        self.import_auth_var = ctk.BooleanVar(value=False)
        self.import_auth_checkbox = ctk.CTkCheckBox(import_uri_frame, text="Auth", 
                                                   variable=self.import_auth_var,
                                                   width=60)
        self.import_auth_checkbox.grid(row=0, column=1, padx=(0, 5), pady=0, sticky="w")
        
        self.import_auth_source = ctk.CTkEntry(import_uri_frame, placeholder_text="authSource", width=100)
        self.import_auth_source.grid(row=0, column=2, padx=(0, 5), pady=0, sticky="ew")
        self.import_auth_source.insert(0, "admin")
        self.import_auth_source.configure(state="disabled")
        
        # Import auth controls row
        import_auth_frame = ctk.CTkFrame(import_frame, fg_color="transparent")
        import_auth_frame.grid(row=3, column=1, padx=10, pady=(0, 5), sticky="ew")
        import_auth_frame.grid_columnconfigure(1, weight=1)
        
        ctk.CTkLabel(import_auth_frame, text="Auth Source:").grid(row=0, column=0, padx=(0, 5), pady=2, sticky="w")
        self.import_auth_source_full = ctk.CTkEntry(import_auth_frame, placeholder_text="e.g., admin", width=150)
        self.import_auth_source_full.grid(row=0, column=1, padx=(0, 5), pady=2, sticky="ew")
        self.import_auth_source_full.insert(0, "admin")
        self.import_auth_source_full.configure(state="disabled")
        
        # Bind checkbox to enable/disable auth source
        self.import_auth_var.trace("w", lambda *args: self.toggle_import_auth_source())
        
        # Destination database for offline import
        ctk.CTkLabel(import_frame, text="Destination DB:").grid(row=4, column=0, padx=10, pady=5, sticky="w")
        self.import_db = ctk.CTkEntry(import_frame, placeholder_text="Destination DB")
        self.import_db.grid(row=4, column=1, padx=10, pady=5, sticky="ew")

        self.import_button = ctk.CTkButton(import_frame, 
                                        text="📤 Import from ZIP",
                                        command=self.start_import_process,
                                        height=35,
                                        font=ctk.CTkFont(size=13))
        self.import_button.grid(row=5, column=0, columnspan=2, padx=10, pady=10, sticky="ew")

        # Tools Check Frame
        self.tools_check_frame = ctk.CTkFrame(self.tab_tools)
        self.tools_check_frame.grid(row=2, column=0, padx=10, pady=(10,0), sticky="ew")
        self.tools_check_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(self.tools_check_frame, text="🧰 MongoDB Tools", font=ctk.CTkFont(size=14, weight="bold")).grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.check_tools_btn = ctk.CTkButton(self.tools_check_frame, text="🔎 Check Tools", width=140, command=self.check_mongo_tools)
        self.check_tools_btn.grid(row=0, column=1, padx=5, pady=5, sticky="e")
        self.tools_check_result = ctk.CTkTextbox(self.tools_check_frame, height=90, wrap="word")
        self.tools_check_result.grid(row=1, column=0, columnspan=2, padx=5, pady=(0,8), sticky="ew")
        self.tools_check_result.insert("1.0", "Click 'Check Tools' to verify mongodump/mongoimport/mongorestore/bsondump installation.")
        self.tools_check_result.configure(state="disabled")

        # Log Frame
        self.sync_log_frame = ctk.CTkFrame(self.tab_tools)
        self.sync_log_frame.grid(row=3, column=0, padx=10, pady=10, sticky="nsew")
        self.sync_log_frame.grid_columnconfigure(0, weight=1)
        self.sync_log_frame.grid_rowconfigure(1, weight=1)

        # Add a label for the log
        ctk.CTkLabel(self.sync_log_frame, 
                    text="📋 Logs",
                    font=ctk.CTkFont(size=14, weight="bold")).grid(row=0, column=0, padx=5, pady=5, sticky="w")

        self.sync_log_textbox = ctk.CTkTextbox(self.sync_log_frame, state="disabled", wrap="word", font=("Courier New", 12))
        self.sync_log_textbox.grid(row=1, column=0, sticky="nsew", padx=5, pady=5)

        # Initially hide offline sync frame
        self.offline_sync_frame.grid_remove()
        self.current_sync_mode = "online"

    def threaded_task(self, target, *args):
        threading.Thread(target=target, args=args, daemon=True).start()

    def connect_to_db(self):
        base_uri = self.uri_entry.get()
        if not base_uri: 
            messagebox.showerror("Error", "Please enter a Connection URI.")
            return
            
        # Build complete URI with authSource if needed
        complete_uri = self.build_uri_with_auth(base_uri, self.has_auth_var.get(), self.auth_source_entry.get())
        
        # Save to history
        self.save_uri_history(complete_uri)
        
        self.connect_button.configure(state="disabled", text="Connecting...")
        self.threaded_task(self._execute_connect, complete_uri)

    def _execute_connect(self, uri):
        try:
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self.client.server_info()
            self.after(0, self.on_connect_success)
        except Exception as e: self.after(0, self.on_connect_fail, e)

    def on_connect_success(self):
        self.connect_button.configure(state="normal", text="🔌 Connect")
        self.status_indicator.configure(text="🟢 Connected", text_color="green")
        messagebox.showinfo("Success", "Connected to MongoDB successfully!")
        self.populate_db_tree()

    def on_connect_fail(self, error):
        self.connect_button.configure(state="normal", text="🔌 Connect")
        self.status_indicator.configure(text="🔴 Disconnected", text_color="red")
        messagebox.showerror("Connection Failed", str(error))
        self.client = None
    
    def populate_db_tree(self):
        for item in self.db_tree.get_children(): self.db_tree.delete(item)
        if not self.client: return
        try:
            system_dbs = ["admin", "config", "local"]
            db_names = [db for db in self.client.list_database_names() if db not in system_dbs]
            for db_name in db_names:
                db_node = self.db_tree.insert("", "end", text=db_name, iid=db_name, open=False)
                self.db_tree.insert(db_node, "end", text="Loading...")
        except Exception as e: messagebox.showerror("Error", f"Cannot retrieve database list: {e}")

    def on_db_open(self, event):
        db_node_id = self.db_tree.focus()
        children = self.db_tree.get_children(db_node_id)
        if children and self.db_tree.item(children[0])['text'] == "Loading...":
            self.db_tree.delete(children[0])
            try:
                collections = self.client[db_node_id].list_collection_names()
                for col_name in collections:
                    self.db_tree.insert(db_node_id, "end", text=col_name, iid=f"{db_node_id}.{col_name}")
            except Exception as e: messagebox.showerror("Error", f"Cannot retrieve collection list: {e}")

    def refresh_current_collection_view(self):
        if self.current_db and self.current_collection:
            self.threaded_task(self._execute_find_documents, self.current_db, self.current_collection)
            self.threaded_task(self._execute_list_indexes, self.current_db, self.current_collection)

    def on_collection_select(self, event):
        self.document_detail_textbox.configure(state="normal")
        self.document_detail_textbox.delete("1.0", "end")
        self.document_detail_textbox.configure(state="disabled")
        selected_id = self.db_tree.focus()
        if not selected_id or "." not in selected_id:
            self.current_db, self.current_collection = None, None
            for item in self.documents_tree.get_children(): self.documents_tree.delete(item)
            return
        self.current_db, self.current_collection = selected_id.split(".", 1)
        self.refresh_current_collection_view()

    def on_document_select(self, event):
        selected_item = self.documents_tree.focus()
        if not selected_item: return
        try:
            doc_id = ObjectId(selected_item)
            self.threaded_task(self._execute_find_one_document, doc_id)
        except InvalidId:
            # If not a valid ObjectId, try using the ID as is
            self.threaded_task(self._execute_find_one_document, selected_item)

    def _execute_find_one_document(self, doc_id):
        if not all([self.client, self.current_db, self.current_collection]): return
        try:
            document = self.client[self.current_db][self.current_collection].find_one({'_id': doc_id})
            if document: self.after(0, self.update_document_detail_view, document)
        except Exception as e: print(f"Error retrieving document details: {e}")

    def update_document_detail_view(self, document):
        self.document_detail_textbox.configure(state="normal")
        self.document_detail_textbox.delete("1.0", "end")
        pretty_json = json.dumps(document, indent=4, default=str)
        self.document_detail_textbox.insert("1.0", pretty_json)
        self.document_detail_textbox.configure(state="disabled")
        
    def apply_filter(self, event=None):
        self.refresh_current_collection_view()

    def _execute_find_documents(self, db_name, col_name):
        if not self.client: return
        query = {}
        
        # Check simple filter first
        field = self.filter_field.get().strip()
        value = self.filter_value.get().strip()
        if field and value:
            # Try to convert value to number or boolean if possible
            try:
                if value.lower() == 'true': value = True
                elif value.lower() == 'false': value = False
                elif value.isdigit(): value = int(value)
                elif value.replace('.', '').isdigit() and value.count('.') == 1:
                    value = float(value)
            except ValueError: pass
            query = {field: value}
        else:
            # Try advanced filter if simple filter is empty
            filter_text = self.filter_entry.get()
            if filter_text:
                try: query = json.loads(filter_text)
                except json.JSONDecodeError:
                    self.after(0, messagebox.showerror, "Error", "Invalid JSON syntax in filter box.")
                    return
        # Build cursor with pagination/sort/projection
        try:
            cursor = self.client[db_name][col_name].find(query)
            # projection
            proj_text = self.projection_entry.get().strip() if hasattr(self, 'projection_entry') else ""
            if proj_text:
                try:
                    projection = json.loads(proj_text)
                    cursor = self.client[db_name][col_name].find(query, projection)
                except Exception:
                    pass
            # sort
            sort_field = self.sort_field_entry.get().strip() if hasattr(self, 'sort_field_entry') else ""
            if sort_field:
                direction = ASCENDING if (self.sort_dir_dropdown.get() if hasattr(self, 'sort_dir_dropdown') else "ASC") == "ASC" else DESCENDING
                cursor = cursor.sort(sort_field, direction)
            # pagination
            try:
                page = int(self.page_entry.get()) if hasattr(self, 'page_entry') else 1
            except Exception:
                page = 1
            try:
                page_size = int(self.page_size_entry.get()) if hasattr(self, 'page_size_entry') else 50
            except Exception:
                page_size = 50
            if page < 1:
                page = 1
            skip = (page - 1) * page_size
            documents = list(cursor.skip(skip).limit(page_size))
            self.after(0, self.update_documents_tree, documents)
        except Exception as e: self.after(0, messagebox.showerror, "Error", f"Cannot retrieve documents: {e}")

    def update_documents_tree(self, documents):
        for item in self.documents_tree.get_children(): self.documents_tree.delete(item)
        for doc in documents:
            doc_id = str(doc.get('_id', 'N/A'))
            preview = {k: v for k, v in doc.items() if k != '_id'}
            content_preview = json.dumps(preview, default=str)[:200] + "..."
            self.documents_tree.insert("", "end", iid=doc_id, values=(doc_id, content_preview))

    def on_saved_query_select(self, *_):
        name = self.saved_query_var.get()
        if name == "Saved queries…":
            return
        scope = self._current_scope_key()
        query = self.saved_queries.get(scope, {}).get(name) or self.saved_queries.get("global", {}).get(name)
        if not query:
            return
        # Apply saved query settings
        self.filter_field.delete(0, 'end'); self.filter_value.delete(0, 'end'); self.filter_entry.delete(0, 'end')
        if query.get('mode') == 'simple':
            self.filter_field.insert(0, query.get('field', ''))
            self.filter_value.insert(0, str(query.get('value', '')))
        else:
            self.filter_entry.insert(0, json.dumps(query.get('advanced', {})))
        # projection
        self.projection_entry.delete(0, 'end'); self.projection_entry.insert(0, query.get('projection', ''))
        # sort
        self.sort_field_entry.delete(0, 'end'); self.sort_field_entry.insert(0, query.get('sort_field', ''))
        self.sort_dir_dropdown.set(query.get('sort_dir', 'ASC'))
        # paging
        self.page_entry.delete(0, 'end'); self.page_entry.insert(0, str(query.get('page', 1)))
        self.page_size_entry.delete(0, 'end'); self.page_size_entry.insert(0, str(query.get('page_size', 50)))
        self.apply_filter()

    def save_current_query(self):
        name = simpledialog.askstring("Save Query", "Enter query name:")
        if not name:
            return
        # capture current query settings
        mode = 'advanced' if self.filter_entry.get().strip() else 'simple'
        data = {
            'mode': mode,
            'field': self.filter_field.get().strip(),
            'value': self.filter_value.get().strip(),
            'advanced': json.loads(self.filter_entry.get().strip()) if self.filter_entry.get().strip() else {},
            'projection': self.projection_entry.get().strip(),
            'sort_field': self.sort_field_entry.get().strip(),
            'sort_dir': self.sort_dir_dropdown.get(),
            'page': int(self.page_entry.get() or 1),
            'page_size': int(self.page_size_entry.get() or 50)
        }
        scope = self._current_scope_key()
        if scope not in self.saved_queries:
            self.saved_queries[scope] = {}
        self.saved_queries[scope][name] = data
        self._save_pickle(self.saved_queries_file, self.saved_queries)
        # refresh dropdown
        values = ["Saved queries…"] + list(self.saved_queries.get("global", {}).keys() | self.saved_queries.get(scope, {}).keys())
        self.saved_query_dropdown.configure(values=values)

    def _current_scope_key(self):
        if self.current_db and self.current_collection:
            return f"{self.current_db}.{self.current_collection}"
        if self.current_db:
            return self.current_db
        return "global"

    def show_advanced_export(self):
        """Show advanced export dialog"""
        if not self.current_collection:
            messagebox.showerror("Error", "Please select a collection first.")
            return
        
        try:
            from advanced_export import create_export_dialog
            create_export_dialog(self, self.client, self.current_db, self.current_collection)
        except ImportError:
            # Fallback to simple export
            self.export_collection()
    
    def export_collection(self):
        """Simple export fallback"""
        if not self.current_collection:
            messagebox.showerror("Error", "Please select a collection first.")
            return
        
        file_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if file_path:
            try:
                documents = list(self.current_collection.find())
                with open(file_path, 'w') as f:
                    json.dump(documents, f, indent=2, default=str)
                messagebox.showinfo("Success", f"Collection exported to {file_path}")
            except Exception as e:
                messagebox.showerror("Error", f"Export failed: {str(e)}")

    def add_document(self):
        if not self.current_collection: return messagebox.showwarning("Warning", "Please select a collection first.")
        dialog = DocumentEditor(title=f"Add Document to '{self.current_collection}'")
        json_text = dialog.get_input()
        if json_text:
            try:
                new_doc = json.loads(json_text)
                self.threaded_task(self._execute_insert, new_doc)
            except Exception as e: messagebox.showerror("Error", f"Cannot add document: {e}")

    def _execute_insert(self, doc):
        self.client[self.current_db][self.current_collection].insert_one(doc)
        self.after(0, self.refresh_current_collection_view)
        self.after(0, messagebox.showinfo, "Success", "Document has been added.")

    def edit_document(self, event=None):
        selected_item = self.documents_tree.focus()
        if not selected_item: return messagebox.showwarning("Warning", "Please select a document to edit.")
        doc_id = ObjectId(selected_item)
        full_doc = self.client[self.current_db][self.current_collection].find_one({'_id': doc_id})
        if not full_doc: return messagebox.showerror("Error", "Document not found.")
        full_doc['_id'] = str(full_doc['_id'])
        pretty_json = json.dumps(full_doc, indent=4, default=str)
        dialog = DocumentEditor(title=f"Edit Document (ID: {doc_id})", existing_json=pretty_json)
        new_json_text = dialog.get_input()
        if new_json_text:
            try:
                updated_data = json.loads(new_json_text)
                if '_id' in updated_data: del updated_data['_id']
                self.threaded_task(self._execute_update, doc_id, updated_data)
            except Exception as e: messagebox.showerror("Error", f"Cannot update document: {e}")

    def _execute_update(self, doc_id, new_data):
        self.client[self.current_db][self.current_collection].update_one({'_id': doc_id}, {'$set': new_data})
        self.after(0, self.refresh_current_collection_view)
        self.after(0, messagebox.showinfo, "Success", "Document has been updated.")

    def delete_document(self):
        selected_item = self.documents_tree.focus()
        if not selected_item: return messagebox.showwarning("Warning", "Please select a document to delete.")
        if messagebox.askyesno("Confirm Deletion", f"Are you sure you want to delete the document with ID: {selected_item}?"):
            self.threaded_task(self._execute_delete, ObjectId(selected_item))

    def _execute_delete(self, doc_id):
        self.client[self.current_db][self.current_collection].delete_one({'_id': doc_id})
        self.after(0, self.refresh_current_collection_view)
        self.after(0, messagebox.showinfo, "Success", "Document has been deleted.")

    def delete_documents_by_filter(self):
        """Delete all documents that match the simple field/value filter."""
        if not all([self.client, self.current_db, self.current_collection]):
            return messagebox.showwarning("Warning", "Please select a collection first.")

        field = self.filter_field.get().strip() if hasattr(self, 'filter_field') else ''
        value = self.filter_value.get().strip() if hasattr(self, 'filter_value') else ''
        if not field or not value:
            return messagebox.showwarning("Warning", "Please enter both field and value for deletion.")

        # Convert value to appropriate type similar to search logic
        conv_value = value
        try:
            if value.lower() == 'true':
                conv_value = True
            elif value.lower() == 'false':
                conv_value = False
            elif value.isdigit():
                conv_value = int(value)
            elif value.replace('.', '').isdigit() and value.count('.') == 1:
                conv_value = float(value)
        except Exception:
            pass

        query = {field: conv_value}

        try:
            col = self.client[self.current_db][self.current_collection]
            count = col.count_documents(query)
            if count == 0:
                return messagebox.showinfo("No Matches", "No documents match the provided field/value.")
            if not messagebox.askyesno(
                "Confirm Bulk Deletion",
                f"Are you sure you want to delete {count} document(s) where '{field}' == '{value}'?\n\nThis action cannot be undone.",
                icon="warning"
            ):
                return
            # Run deletion in background
            self.threaded_task(self._execute_delete_many, query, count, field, value)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to prepare deletion: {e}")

    def _execute_delete_many(self, query, count, field, value):
        try:
            res = self.client[self.current_db][self.current_collection].delete_many(query)
            deleted = getattr(res, 'deleted_count', None)
            self.after(0, self.refresh_current_collection_view)
            msg = f"Deleted {deleted if deleted is not None else count} document(s) where '{field}' == '{value}'."
            self.after(0, messagebox.showinfo, "Success", msg)
        except Exception as e:
            self.after(0, messagebox.showerror, "Error", f"Bulk delete failed: {e}")

    def add_index(self):
        if not self.current_collection: return messagebox.showwarning("Warning", "Please select a collection first.")
        index_definition = simpledialog.askstring("Create Index", 
            "Enter index definition, e.g.: [('field1', 1), ('field2', -1)]\n"
            "Hoặc [('email', 1)], {'unique': True}")
        if index_definition:
            try:
                if "]," in index_definition:
                    keys_str, options_str = index_definition.split("],", 1)
                    keys = ast.literal_eval(keys_str + "]")
                    options = ast.literal_eval(options_str)
                else:
                    keys = ast.literal_eval(index_definition)
                    options = {}
                self.threaded_task(self._execute_create_index, keys, **options)
            except Exception as e: messagebox.showerror("Error", f"Invalid index definition: {e}")

    def _execute_create_index(self, keys, **options):
        self.client[self.current_db][self.current_collection].create_index(keys, **options)
        self.after(0, self.refresh_current_collection_view)
        self.after(0, messagebox.showinfo, "Success", "Index has been created.")

    def drop_index(self):
        if not self.current_collection: return messagebox.showwarning("Warning", "Please select a collection first.")
        index_name = self.drop_index_entry.get()
        if not index_name: return messagebox.showwarning("Warning", "Please enter the name of the index to drop.")
        if messagebox.askyesno("Confirm Deletion", f"Are you sure you want to delete the index '{index_name}'?"):
            self.threaded_task(self._execute_drop_index, index_name)

    def _execute_drop_index(self, index_name):
        try:
            self.client[self.current_db][self.current_collection].drop_index(index_name)
            self.after(0, self.refresh_current_collection_view)
            self.after(0, messagebox.showinfo, "Success", "Index has been dropped.")
        except Exception as e: self.after(0, messagebox.showerror, "Error", f"Cannot drop index: {e}")

    def create_collection(self):
        if not self.client:
            messagebox.showwarning("Warning", "Please connect to MongoDB first.")
            return
            
        selected = self.db_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a database.")
            return
            
        # If a collection is selected, get its database
        selected_item = selected[0]
        if "." in selected_item:
            selected_item = selected_item.split(".")[0]
            
        # Ask for collection name
        dialog = ctk.CTkInputDialog(text="Enter new collection name:", title="Create Collection")
        col_name = dialog.get_input()
        
        if col_name:
            try:
                self.client[selected_item].create_collection(col_name)
                messagebox.showinfo("Success", f"Collection '{col_name}' has been created.")
                self.populate_db_tree()
                # Expand the database node to show the new collection
                self.db_tree.item(selected_item, open=True)
            except Exception as e:
                messagebox.showerror("Error", f"Cannot create collection: {e}")

    def delete_collection(self):
        if not self.client:
            messagebox.showwarning("Warning", "Please connect to MongoDB first.")
            return
            
        selected = self.db_tree.selection()
        if not selected or "." not in selected[0]:
            messagebox.showwarning("Warning", "Please select a collection to delete.")
            return
            
        db_name, col_name = selected[0].split(".", 1)

        if messagebox.askyesno("Confirm Deletion",
                             f"Are you sure you want to delete the collection '{col_name}'?\n\n"
                             "WARNING: This action cannot be undone and will delete all data!",
                             icon="warning"):
            try:
                self.client[db_name].drop_collection(col_name)
                messagebox.showinfo("Success", f"Collection '{col_name}' has been deleted.")
                self.populate_db_tree()
            except Exception as e:
                messagebox.showerror("Error", f"Cannot delete collection: {e}")

    def _execute_list_indexes(self, db_name, col_name):
        if not self.client: return
        try:
            indexes = list(self.client[db_name][col_name].list_indexes())
            self.after(0, self.update_index_list, indexes)
        except Exception as e: self.after(0, messagebox.showerror, "Error", f"Cannot retrieve indexes: {e}")

    def update_index_list(self, indexes):
        self.index_list.configure(state="normal")
        self.index_list.delete("1.0", "end")
        if not indexes:
            self.index_list.insert("1.0", "No indexes found.")
        else:
            for index in indexes:
                index_str = json.dumps(index, indent=4, default=str)
                self.index_list.insert("end", index_str.replace('"key": ', '"key":\n    ').replace(', "ns"', '\n   ,"ns"') + "\n\n")
        self.index_list.configure(state="disabled")

    def log_sync_message(self, message):
        self.sync_log_textbox.configure(state="normal")
        self.sync_log_textbox.insert("end", message + "\n")
        self.sync_log_textbox.see("end")
        self.sync_log_textbox.configure(state="disabled")
        
    def start_sync_process(self):
        # Build complete URIs with authSource if needed
        source_uri = self.build_uri_with_auth(
            self.sync_source_uri.get(), 
            self.sync_source_auth_var.get(), 
            self.sync_source_auth_source_full.get()
        )
        dest_uri = self.build_uri_with_auth(
            self.sync_dest_uri.get(), 
            self.sync_dest_auth_var.get(), 
            self.sync_dest_auth_source_full.get()
        )
        
        params = {
            "source_uri": source_uri,
            "source_db": self.sync_source_db.get(),
            "dest_uri": dest_uri,
            "dest_db": self.sync_dest_db.get()
        }
        if not all(params.values()): 
            messagebox.showerror("Error", "Please fill in all sync information.")
            return
            
        self.sync_button.configure(state="disabled", text="Syncing...")
        self.sync_log_textbox.configure(state="normal")
        self.sync_log_textbox.delete("1.0", "end")
        self.sync_log_textbox.configure(state="disabled")
        self.threaded_task(self._execute_sync, params)

    def _run_sync_command(self, command_parts):
        process = subprocess.Popen(
            command_parts, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', creationflags=subprocess.CREATE_NO_WINDOW
        )
        for line in iter(process.stdout.readline, ''): self.after(0, self.log_sync_message, line.strip())
        process.wait()
        if process.returncode != 0 and "mongorestore" not in command_parts[0]:
            raise subprocess.CalledProcessError(process.returncode, command_parts)

    def show_sync_panel(self, mode):
        """Switch between online and offline sync panels"""
        if mode == "online":
            self.offline_sync_frame.grid_remove()
            self.online_sync_frame.grid()
            self.online_sync_btn.configure(fg_color="#0056b3")
            self.offline_sync_btn.configure(fg_color="#28a745")
            self.current_sync_mode = "online"
        else:
            self.online_sync_frame.grid_remove()
            self.offline_sync_frame.grid()
            self.online_sync_btn.configure(fg_color="#007bff")
            self.offline_sync_btn.configure(fg_color="#1e7e34")
            self.current_sync_mode = "offline"

    def check_mongo_tools(self):
        """Check if MongoDB Database Tools are installed and report versions or guidance."""
        tools = [
            ("mongodump", "Dump database to BSON"),
            ("mongoimport", "Import JSON/CSV to MongoDB"),
            ("mongorestore", "Restore from dump"),
            ("bsondump", "Convert BSON to JSON")
        ]
        results = []
        # Allow writing to textbox
        self.tools_check_result.configure(state="normal")
        self.tools_check_result.delete("1.0", "end")
        create_flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
        for tool, desc in tools:
            path = shutil.which(tool)
            if not path:
                results.append(f"❌ {tool}: Not found in PATH. ({desc})")
                continue
            try:
                proc = subprocess.run([tool, "--version"], capture_output=True, text=True, creationflags=create_flags)
                version_line = proc.stdout.splitlines()[0] if proc.stdout else (proc.stderr.splitlines()[0] if proc.stderr else "")
                results.append(f"✅ {tool}: {version_line} | Path: {path}")
            except Exception as e:
                results.append(f"⚠️ {tool}: Found at {path} but failed to run --version ({e})")

        missing = [t for i,(t,_) in enumerate(tools) if any(line.startswith(f"❌ {t}:") for line in results)]
        if missing:
            results.append("")
            results.append("Hướng dẫn cài đặt MongoDB Database Tools (Windows):")
            results.append("1) Tải bộ công cụ: https://www.mongodb.com/try/download/database-tools")
            results.append("2) Giải nén và thêm thư mục 'bin' vào PATH (System Environment Variables)")
            results.append("3) Mở cửa sổ mới của ứng dụng sau khi cập nhật PATH")
            results.append("")
            results.append("Installation guide (English):")
            results.append("1) Download: https://www.mongodb.com/try/download/database-tools")
            results.append("2) Extract and add the 'bin' folder to PATH")
            results.append("3) Restart this app after PATH update")

        self.tools_check_result.insert("1.0", "\n".join(results))
        self.tools_check_result.configure(state="disabled")

    def choose_import_file(self):
        """Open file dialog to choose ZIP file for import"""
        from tkinter import filedialog
        filename = filedialog.askopenfilename(
            title="Choose ZIP file to import",
            filetypes=[("ZIP files", "*.zip")]
        )
        if filename:
            self.import_file_path = filename
            self.import_file_button.configure(text=f"📂 {Path(filename).name}")
            self.log_sync_message(f"Selected file: {filename}")

            # Clear the form
            self.import_uri.delete(0, 'end')
            self.import_db.delete(0, 'end')

    def start_export_process(self):
        """Start the export process for offline sync"""
        # If an export is already in progress, don't start another one
        if self.export_button.cget("state") == "disabled":
            return

        from tkinter import filedialog
        import zipfile, shutil

        # Get export parameters and build complete URI with authSource if needed
        base_uri = self.export_uri.get()
        complete_uri = self.build_uri_with_auth(
            base_uri, 
            self.export_auth_var.get(), 
            self.export_auth_source_full.get()
        )
        db = self.export_db.get()
        if not db:
            messagebox.showerror("Error", "Please enter Source DB to export.")
            return
        
        if not all([base_uri, db]):
            messagebox.showerror("Error", "Please fill in all export information.")
            return

        # Ask for save location
        save_path = filedialog.asksaveasfilename(
            defaultextension=".zip",
            filetypes=[("ZIP files", "*.zip")],
            title="Choose ZIP file to save"
        )
        
        if not save_path:
            return

        # Clear previous log messages
        self.sync_log_textbox.configure(state="normal")
        self.sync_log_textbox.delete("1.0", "end")
        self.sync_log_textbox.configure(state="disabled")

        self.export_button.configure(state="disabled", text="Exporting...")
        # Parse collections list (optional)
        cols_text = self.export_collections.get("1.0", "end").strip() if hasattr(self, 'export_collections') else ""
        collections = []
        if cols_text and not cols_text.startswith("One per line"):
            collections = [c.strip() for c in cols_text.splitlines() if c.strip()]

        self.export_button.configure(state="disabled", text="Exporting...")
        self.threaded_task(self._execute_export, {"uri": complete_uri, "db": db, "save_path": save_path, "collections": collections})

    # Thay thế TOÀN BỘ hàm _execute_export cũ bằng hàm này.

    def _execute_export(self, params):
        """Execute the export process with robust, separate parameters."""
        from pymongo.errors import ConnectionFailure, OperationFailure
        from urllib.parse import urlparse, parse_qs

        try:
            raw_uri = params["uri"]
            db = params["db"]
            save_path = params["save_path"]
            parsed_uri = urlparse(raw_uri)
            
            # 1. Test connection and authentication using PyMongo first
            try:
                self.log_sync_message(f"Attempting to connect to {parsed_uri.hostname}...")
                with MongoClient(raw_uri, serverSelectionTimeoutMS=5000) as test_client:
                    test_client.admin.command('ping')
                self.log_sync_message("✅ Connection successful via PyMongo.")
            except (ConnectionFailure, OperationFailure) as e:
                self.after(0, messagebox.showerror, "Connection/Auth Error",
                    "Could not connect or authenticate with the MongoDB server.\n\n"
                    "Please verify:\n"
                    "1. The URI, username, password are correct.\n"
                    "2. The 'authSource' database is correct (e.g., ?authSource=admin).\n"
                    f"3. The server is accessible.\n\nDetails: {e}")
                # Reset export button to normal state before returning
                self.after(0, self.reset_export_button)
                return

            # 2. Build the mongodump command using individual parameters for robustness
            with tempfile.TemporaryDirectory() as temp_dir:
                dump_dir = Path(temp_dir)
                
                self.log_sync_message("🔄 [1/2] Building and executing mongodump command...")
                
                # Start with the basic command parts
                dump_cmd = [
                    'mongodump',
                    f'--host={parsed_uri.hostname}',
                    f'--port={str(parsed_uri.port or 27017)}',
                    f'--db={db}',
                    f'--out={str(dump_dir)}'
                ]

                # Add authentication parameters if they exist in the URI
                if parsed_uri.username:
                    dump_cmd.append(f'--username={parsed_uri.username}')
                if parsed_uri.password:
                    dump_cmd.append(f'--password={parsed_uri.password}')

                # Crucially, parse the authSource from the query string
                query_params = parse_qs(parsed_uri.query)
                if 'authSource' in query_params:
                    auth_db = query_params['authSource'][0]
                    dump_cmd.append(f'--authenticationDatabase={auth_db}')
                    self.log_sync_message(f"Using authentication database: {auth_db}")

                # If user selected specific collections, run mongodump per collection
                collections = params.get('collections') or []
                if collections:
                    aggregate_stdout = []
                    aggregate_stderr = []
                    for col in collections:
                        col_cmd = dump_cmd + [f'--collection={col}']
                        res = subprocess.run(col_cmd, capture_output=True, text=True, check=False)
                        if res.stdout:
                            aggregate_stdout.append(res.stdout)
                        if res.stderr:
                            aggregate_stderr.append(res.stderr)
                        if res.returncode != 0:
                            raise Exception(f"mongodump failed for collection '{col}'. Details: {res.stderr}")
                    result_stdout = "\n".join(aggregate_stdout)
                    result_stderr = "\n".join(aggregate_stderr)
                    result_code = 0
                else:
                    # Execute the command without shell=True
                    result = subprocess.run(dump_cmd, capture_output=True, text=True, check=False)
                    result_stdout = result.stdout
                    result_stderr = result.stderr
                    result_code = result.returncode
                
                # Log output for debugging
                if result_stdout:
                    self.log_sync_message(result_stdout)
                if result_stderr:
                    self.log_sync_message(f"Error from mongodump: {result_stderr}")
                if result_code != 0:
                    raise Exception(f"mongodump failed. Please check the logs above for details.")

                self.log_sync_message("📦 [2/2] Compressing to ZIP...")
                shutil.make_archive(save_path.replace('.zip', ''), 'zip', dump_dir)
                self.log_sync_message(f"✅ Exported successfully: {save_path}")

        except Exception as e:
            self.log_sync_message(f"❌ Export failed: {e}")
            self.after(0, messagebox.showerror, "Export Error", f"An error occurred during export:\n\n{e}")

        finally:
            # Reset export button to normal state
            self.after(0, self.reset_export_button)

    def reset_export_button(self):
        """Reset export button to normal state"""
        self.export_button.configure(state="normal", text="💾 Export to ZIP file")

    def start_import_process(self):
        """Start the import process for offline sync"""
        if not hasattr(self, 'import_file_path'):
            messagebox.showerror("Error", "Please choose a ZIP file to import")
            return

        base_uri = self.import_uri.get()
        complete_uri = self.build_uri_with_auth(
            base_uri, 
            self.import_auth_var.get(), 
            self.import_auth_source_full.get()
        )
        db = self.import_db.get()

        if not all([base_uri, db]):
            messagebox.showerror("Error", "Please fill in all import data")
            return

        self.import_button.configure(state="disabled", text="Importing...")
        self.threaded_task(self._execute_import, {
            "zip_path": self.import_file_path,
            "uri": complete_uri,
            "db": db
        })

    def _execute_import(self, params):
        """Execute the import process with safe URI handling"""
        import subprocess, tempfile, zipfile
        from pathlib import Path
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                dump_dir = Path(temp_dir)
                self.log_sync_message("📦 [1/4] Extracting ZIP...")
                with zipfile.ZipFile(params["zip_path"], 'r') as zip_ref:
                    zip_ref.extractall(dump_dir)
                db_dirs = list(dump_dir.glob("*"))
                if not db_dirs:
                    raise Exception("No data found in ZIP file")
                # Detect source DB from extracted ZIP structure
                source_db = db_dirs[0].name
                dump_path_db = dump_dir / source_db
                self.log_sync_message("🔄 [2/4] Converting BSON to JSON...")
                for bson_file in dump_path_db.glob("*.bson"):
                    json_file = str(bson_file.with_suffix(".json"))
                    cmd = f'bsondump --outFile="{json_file}" "{bson_file}"'
                    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                    self.log_sync_message(result.stdout)
                    if result.returncode != 0:
                        raise Exception(result.stderr)
                self.log_sync_message("📤 [3/4] Importing data...")
                uri = params["uri"]
                db = params["db"]
                for json_file in dump_path_db.glob("*.json"):
                    if not json_file.name.endswith('.metadata.json'):
                        cmd = f'mongoimport --uri="{uri}" --db={db} --collection={json_file.stem} --mode=upsert --drop --file="{json_file}"'
                        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                        self.log_sync_message(result.stdout)
                        if result.returncode != 0:
                            raise Exception(result.stderr)
                self.log_sync_message("📋 [4/4] Restoring indexes...")
                restore_cmd = f'mongorestore --uri="{uri}" --nsFrom={source_db}.* --nsTo={db}.* "{dump_dir}"'
                result = subprocess.run(restore_cmd, shell=True, capture_output=True, text=True)
                self.log_sync_message(result.stdout)
                if result.returncode != 0:
                    raise Exception(result.stderr)
                self.log_sync_message("✅ Import successful!")
        except Exception as e:
            self.log_sync_message(f"❌ Import failed: {e}")
        finally:
            # Reset import button to normal state
            self.after(0, self.reset_import_button)

    def reset_import_button(self):
        """Reset import button to normal state"""
        self.import_button.configure(state="normal", text="📤 Import from ZIP")

    def _execute_sync(self, params):
        """Execute the online sync process"""
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                dump_dir = Path(temp_dir)
                dump_path_db = dump_dir / params["source_db"]

                self.after(0, self.log_sync_message, "🔄 [1/4] Dumping from source...")
                self._run_sync_command([
                    'mongodump',
                    f'--uri={params["source_uri"]}',
                    f'--db={params["source_db"]}',
                    f'--out={dump_dir}'
                ])

                self.after(0, self.log_sync_message, "📦 [2/4] Converting BSON to JSON...")
                for bson_file in dump_path_db.glob("*.bson"):
                    self._run_sync_command(['bsondump', f'--outFile={bson_file.with_suffix(".json")}', str(bson_file)])

                self.after(0, self.log_sync_message, "📤 [3/4] Importing data...")
                for json_file in dump_path_db.glob("*.json"):
                    if not json_file.name.endswith('.metadata.json'):
                        self._run_sync_command([
                            'mongoimport',
                            f'--uri={params["dest_uri"]}',
                            f'--db={params["dest_db"]}',
                            f'--collection={json_file.stem}',
                            '--mode=upsert',
                            '--drop',
                            f'--file={json_file}'
                        ])

                self.after(0, self.log_sync_message, "📋 [4/4] Restoring indexes...")
                self._run_sync_command([
                    'mongorestore',
                    f'--uri={params["dest_uri"]}',
                    f'--nsFrom={params["source_db"]}.*',
                    f'--nsTo={params["dest_db"]}.*',
                    str(dump_dir)
                ])

                self.after(0, self.log_sync_message, "✅ Sync completed!")
                self.after(0, messagebox.showinfo, "Success", "Sync process completed successfully!")
        except Exception as e:
            self.after(0, messagebox.showerror, "Error", f"Error during sync process: {e}")
        finally:
            # Reset sync button to normal state
            self.after(0, self.reset_sync_button)

    def reset_sync_button(self):
        """Reset sync button to normal state"""
        self.sync_button.configure(state="normal", text="🚀 Start Sync")

    def setup_guide_tab(self):
        """Setup the Guide tab with usage instructions"""
        self.tab_guide.grid_columnconfigure(0, weight=1)
        self.tab_guide.grid_rowconfigure(1, weight=1)

        # Title
        title_frame = ctk.CTkFrame(self.tab_guide, fg_color="transparent")
        title_frame.grid(row=0, column=0, padx=20, pady=(20,10), sticky="ew")
        
        ctk.CTkLabel(title_frame, 
                    text="📚 User Guide",
                    font=ctk.CTkFont(size=24, weight="bold")).pack()

        # Main content frame with two columns (VN | EN)
        content_frame = ctk.CTkFrame(self.tab_guide)
        content_frame.grid(row=1, column=0, padx=20, pady=(0,20), sticky="nsew")
        content_frame.grid_columnconfigure(0, weight=1)
        content_frame.grid_columnconfigure(1, weight=1)
        content_frame.grid_rowconfigure(1, weight=1)

        # Column titles
        ctk.CTkLabel(content_frame, text="🇻🇳 Hướng dẫn (Tiếng Việt)", font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=0, padx=15, pady=(12,0), sticky="w")
        ctk.CTkLabel(content_frame, text="🇺🇸 Guide (English)", font=ctk.CTkFont(size=16, weight="bold")).grid(row=0, column=1, padx=15, pady=(12,0), sticky="w")

        # VN guide
        vn_text = ctk.CTkTextbox(content_frame, font=("Arial", 13))
        vn_text.grid(row=1, column=0, padx=15, pady=10, sticky="nsew")
        vn_guide_content = """🔹 Tổng quan

Ứng dụng hỗ trợ quản lý và đồng bộ cơ sở dữ liệu MongoDB với giao diện trực quan, gồm các tab:
• 🗄️ Management: Duyệt DB/Collection, xem/sửa Document, Index, truy vấn và lưu truy vấn.
• 🔄 Sync: Đồng bộ Online giữa 2 cụm MongoDB hoặc Offline qua file ZIP.
• 📊 Analytics: Tổng quan dữ liệu và thông tin hiệu năng cơ bản.
• ⚡ Performance: Theo dõi CPU/Memory (mô phỏng) và chỉ số hoạt động.
• 📚 Guide, 📞 Contact: Tài liệu hướng dẫn và thông tin hỗ trợ.

🔹 Quản lý (Management)

1) Kết nối MongoDB
   • Nhập URI MongoDB ở thanh trên (ví dụ: mongodb://localhost:27017).
   • Nếu URI có tài khoản/mật khẩu, bật "URI có mật khẩu" và nhập authSource (ví dụ: admin).
   • Nhấn "Connect" để kết nối. Hệ thống sẽ ẩn các DB hệ thống: admin, config, local.
   • Lịch sử URI và Profiles giúp lưu/tải nhanh cấu hình kết nối.

2) Duyệt và quản lý Collection
   • Nhấp vào tên Database để xem danh sách Collection.
   • "Add Collection" để tạo mới, "Drop Collection" để xóa.
   • Xem thống kê DB/Collection bằng các nút "Database Stats" và "Collection Stats".

3) Làm việc với Document
   • Tìm kiếm nhanh: nhập Tên trường và Giá trị, nhấn "Search".
   • Tìm kiếm nâng cao: nhập JSON filter (ví dụ: {\"age\": {\"$gt\": 25}}).
   • Phân trang, sắp xếp (ASC/DESC) và Projection để giới hạn trường trả về.
   • Double-click vào Document để sửa. Dùng "Create New Document" để thêm mới, "Drop Selected Document" để xóa.

4) Chỉ mục (Index)
   • Xem danh sách index ở panel bên phải; tạo/xóa index với các tuỳ chọn.
   • Khuyến nghị: tạo index cho các trường truy vấn thường xuyên để tối ưu hiệu năng.

5) Truy vấn đã lưu (Saved Queries) & Profiles
   • Lưu các filter hay dùng để tái sử dụng nhanh.
   • Profiles lưu cấu hình kết nối (URI, authSource…).

🔹 Đồng bộ (Sync)

Yêu cầu: cần cài sẵn công cụ dòng lệnh của MongoDB (mongodump/mongorestore/mongoexport/mongoimport) trong PATH.

1) Online Sync
   • Nhập Source URI/DB và Destination URI/DB; bật Auth nếu cần và nhập authSource.
   • Nhấn "Start Sync" để đồng bộ dữ liệu và index trực tiếp giữa hai cụm.

2) Offline Sync
   • Export: nhập Source URI/DB, nhấn Export để tạo thư mục/ZIP dữ liệu và index.
   • Import: chọn file ZIP, nhập Destination URI/DB và (tuỳ chọn) Source DB trong gói; nhấn Import để khôi phục.

🔹 Analytics & Performance

• Analytics: hiển thị tổng quan DB/Collection; nhấn "Refresh Data" để cập nhật.
• Performance: theo dõi CPU/Memory mô phỏng theo thời gian thực và một số chỉ số DB.

🔹 Thực hành tốt (Best Practices)

• An toàn dữ liệu: kiểm tra kỹ thông tin kết nối; sao lưu trước khi thao tác; dùng unique index khi cần.
• Hiệu năng: tạo index hợp lý; giới hạn số lượng kết quả; cân nhắc kích thước collection khi đồng bộ.
• Nhật ký (Logs): kiểm tra file logs/app.log khi gặp lỗi.

🔹 Xử lý sự cố (Troubleshooting)

• Không kết nối được: kiểm tra URI, mạng, quyền truy cập, authSource.
• Lỗi sync: đảm bảo đã cài mongodump/mongorestore và thêm vào PATH; kiểm tra thông báo lỗi trong Logs.
• Khôi phục thất bại: kiểm tra tên DB nguồn/đích, quyền ghi, dung lượng đĩa.
"""
        vn_text.insert("1.0", vn_guide_content)
        vn_text.configure(state="disabled")

        # EN guide
        en_text = ctk.CTkTextbox(content_frame, font=("Arial", 13))
        en_text.grid(row=1, column=1, padx=15, pady=10, sticky="nsew")
        en_guide_content = """🔹 Overview

This app helps you manage and synchronize MongoDB databases with a clean UI. Tabs include:
• 🗄️ Management: Browse DB/Collections, view/edit Documents, manage Indexes, query and save queries.
• 🔄 Sync: Online sync between two MongoDB clusters or Offline via ZIP.
• 📊 Analytics: Basic database overview and insights.
• ⚡ Performance: Real-time (simulated) CPU/Memory and activity metrics.
• 📚 Guide, 📞 Contact: Documentation and support info.

🔹 Management

1) Connect to MongoDB
   • Enter MongoDB URI (e.g., mongodb://localhost:27017) in the top bar.
   • If the URI uses credentials, enable "URI has password" and set authSource (e.g., admin).
   • Click "Connect". System databases (admin, config, local) are hidden by default.
   • Use URI History and Profiles to quickly reuse connection configs.

2) Browse and manage Collections
   • Click a database to list its collections.
   • "Add Collection" to create, "Drop Collection" to delete.
   • Use "Database Stats" and "Collection Stats" to view statistics.

3) Work with Documents
   • Simple search by Field and Value; advanced search via JSON filter (e.g., {\"age\": {\"$gt\": 25}}).
   • Pagination, Sorting (ASC/DESC), and Projection are supported.
   • Double-click a document to edit. Use "Create New Document" to add, "Drop Selected Document" to delete.

4) Indexes
   • View existing indexes in the right panel; create/drop indexes with options.
   • Tip: Add indexes to frequently queried fields to improve performance.

5) Saved Queries & Profiles
   • Save common filters for quick reuse.
   • Profiles store connection settings (URI, authSource, etc.).

🔹 Sync

Requirements: MongoDB CLI tools (mongodump/mongorestore/mongoexport/mongoimport) must be installed and available in PATH.

1) Online Sync
   • Provide Source URI/DB and Destination URI/DB; enable Auth and set authSource if needed.
   • Click "Start Sync" to sync data and indexes directly between clusters.

2) Offline Sync
   • Export: enter Source URI/DB, click Export to create a dataset ZIP with data and indexes.
   • Import: choose ZIP, set Destination URI/DB and optional Source DB inside the package; click Import to restore.

🔹 Analytics & Performance

• Analytics: shows database/collection overview; click "Refresh Data" to update.
• Performance: real-time simulated CPU/Memory plus basic DB metrics.

🔹 Best Practices

• Data safety: verify connection details; backup before operations; use unique indexes when appropriate.
• Performance: design proper indexes; limit result sets; consider collection sizes during sync.
• Logs: see logs/app.log for diagnostics when errors occur.

🔹 Troubleshooting

• Connection issues: verify URI, network, permissions, and authSource.
• Sync failures: ensure mongodump/mongorestore are installed and in PATH; check logs for errors.
• Restore problems: verify source/destination DB names, write permissions, and disk space.
"""
        en_text.insert("1.0", en_guide_content)
        en_text.configure(state="disabled")

    def show_stats_dialog(self, title, stats_data):
        """Show statistics in a dialog window"""
        dialog = ctk.CTkToplevel(self)
        dialog.title(title)
        dialog.geometry("600x700")
        dialog.transient(self)
        dialog.grab_set()

        # Make dialog resizable
        dialog.grid_columnconfigure(0, weight=1)
        dialog.grid_rowconfigure(1, weight=1)

        # Title
        ctk.CTkLabel(dialog, 
                    text=title,
                    font=ctk.CTkFont(size=20, weight="bold")).grid(
                        row=0, column=0, padx=20, pady=(20,10), sticky="w")

        # Stats content
        content_frame = ctk.CTkFrame(dialog)
        content_frame.grid(row=1, column=0, padx=20, pady=(0,20), sticky="nsew")
        content_frame.grid_columnconfigure(0, weight=1)
        content_frame.grid_rowconfigure(0, weight=1)

        stats_text = ctk.CTkTextbox(content_frame, font=("Courier New", 13))
        stats_text.grid(row=0, column=0, padx=15, pady=15, sticky="nsew")

        # Format and display stats
        formatted_stats = []
        for key, value in stats_data.items():
            if isinstance(value, int) and key.endswith("Size"):
                # Convert bytes to MB for size values
                value_mb = value / (1024 * 1024)
                formatted_stats.append(f"📊 {key}: {value_mb:.2f} MB")
            elif isinstance(value, int):
                formatted_stats.append(f"📊 {key}: {value:,}")
            else:
                formatted_stats.append(f"📊 {key}: {value}")

        stats_text.insert("1.0", "\n".join(formatted_stats))
        stats_text.configure(state="disabled")

    def show_db_stats(self):
        """Show database statistics"""
        if not self.client:
            messagebox.showwarning("Warning", "Please connect to MongoDB first.")
            return

        selected = self.db_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a database.")
            return

        # Get database name
        db_name = selected[0].split(".")[0] if "." in selected[0] else selected[0]

        try:
            stats = self.client[db_name].command("dbStats")
            self.show_stats_dialog(f"Database Statistics - {db_name}", {
                "Database": db_name,
                "Collections": stats["collections"],
                "Total Documents": stats["objects"],
                "Total Size": stats["dataSize"],
                "Storage Size": stats["storageSize"],
                "Indexes": stats["indexes"],
                "Index Size": stats["indexSize"],
                "Average Document Size": stats["avgObjSize"] if "avgObjSize" in stats else "N/A",
                "Files Size": stats["fileSize"] if "fileSize" in stats else "N/A",
                "Number of Extents": stats["numExtents"] if "numExtents" in stats else "N/A",
            })
        except Exception as e:
            messagebox.showerror("Error", f"Could not retrieve database statistics: {e}")

    def show_collection_stats(self):
        """Show collection statistics"""
        if not self.client:
            messagebox.showwarning("Warning", "Please connect to MongoDB first.")
            return

        selected = self.db_tree.selection()
        if not selected or "." not in selected[0]:
            messagebox.showwarning("Warning", "Please select a collection.")
            return

        db_name, col_name = selected[0].split(".", 1)

        try:
            stats = self.client[db_name].command("collStats", col_name)
            self.show_stats_dialog(f"Collection Statistics - {col_name}", {
                "Database": db_name,
                "Collection": col_name,
                "Document Count": stats["count"],
                "Total Size": stats["size"],
                "Average Document Size": stats["avgObjSize"],
                "Storage Size": stats["storageSize"],
                "Number of Indexes": stats["nindexes"],
                "Total Index Size": stats["totalIndexSize"],
                "Is Capped": "Yes" if stats.get("capped", False) else "No",
                "Max Documents": stats.get("max", "No limit"),
                "Namespace Size": stats.get("ns", "N/A"),
                "Number of Extents": stats.get("numExtents", "N/A"),
                "Last Extent Size": stats.get("lastExtentSize", "N/A"),
                "Padding Factor": stats.get("paddingFactor", "N/A"),
            })
        except Exception as e:
            messagebox.showerror("Error", f"Could not retrieve collection statistics: {e}")

    def setup_contact_tab(self):
        """Setup the Contact tab with developer information"""
        self.tab_contact.grid_columnconfigure(0, weight=1)
        
        # Main content frame
        main_frame = ctk.CTkFrame(self.tab_contact)
        main_frame.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        main_frame.grid_columnconfigure(0, weight=1)

        # Developer Info Section
        dev_frame = ctk.CTkFrame(main_frame)
        dev_frame.grid(row=0, column=0, padx=20, pady=20, sticky="ew")
        
        # Title
        ctk.CTkLabel(dev_frame, 
                    text="👨‍💻 Developer Information",
                    font=ctk.CTkFont(size=24, weight="bold")).pack(pady=10)

        info_text = """
        🎓 Developer: KHANH DUY BUI
        🏢 Organization: University of Science and Technology
        📧 Email: duy.bk1608@gmail.com
        📱 Phone: +84 862 607 525
        🌐 GitHub: https://github.com/thaytoiyeucoay
        Facebook: https://www.facebook.com/duydangbuon1605
        """
        
        ctk.CTkLabel(dev_frame, 
                    text=info_text,
                    font=("Arial", 14),
                    justify="left").pack(pady=10)

        # Application Info Section
        app_frame = ctk.CTkFrame(main_frame)
        app_frame.grid(row=1, column=0, padx=20, pady=20, sticky="ew")
        
        ctk.CTkLabel(app_frame, 
                    text="📱 Application Information",
                    font=ctk.CTkFont(size=20, weight="bold")).pack(pady=10)

        app_info = """
        🔷 Version: 1.0.0
        🔷 Release Date: August 2025
        🔷 License: © 2025 University of Science and Technology. All rights reserved.

        This application is designed to help manage and synchronize MongoDB databases 
        efficiently. For support or feature requests, please contact the developer 
        using the information above.
        """
        
        ctk.CTkLabel(app_frame, 
                    text=app_info,
                    font=("Arial", 13),
                    justify="left").pack(pady=10)

        # Support Section
        support_frame = ctk.CTkFrame(main_frame)
        support_frame.grid(row=2, column=0, padx=20, pady=20, sticky="ew")
        
        ctk.CTkLabel(support_frame, 
                    text="🆘 Support",
                    font=ctk.CTkFont(size=20, weight="bold")).pack(pady=10)

        support_info = """
        For technical support or to report issues:
        
        1. Email: nhatld@vcsvietnam.vn
        2. Phone: +84 989 368 698
        3. Working Hours: Monday - Friday, 8:00 AM - 5:30 PM (GMT+7)

        Please include detailed information about your issue and screenshots 
        if applicable when reporting problems.
        """
        
        ctk.CTkLabel(support_frame, 
                    text=support_info,
                    font=("Arial", 13),
                    justify="left").pack(pady=10)

    def load_uri_history(self):
        """Load URI history from a file."""
        if os.path.exists(self.uri_history_file):
            try:
                with open(self.uri_history_file, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Error loading URI history: {e}")
        return []

    def _load_pickle(self, path, default=None):
        try:
            if os.path.exists(path):
                with open(path, 'rb') as f:
                    return pickle.load(f)
        except Exception as e:
            print(f"Error loading {path}: {e}")
        return default

    def _save_pickle(self, path, data):
        try:
            with open(path, 'wb') as f:
                pickle.dump(data, f)
        except Exception as e:
            print(f"Error saving {path}: {e}")

    def _setup_logging(self):
        self.logger = logging.getLogger("MongoSyncTool")
        self.logger.setLevel(logging.INFO)
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        handler = RotatingFileHandler(log_dir / "app.log", maxBytes=2*1024*1024, backupCount=3, encoding="utf-8")
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        if not self.logger.handlers:
            self.logger.addHandler(handler)

    def save_uri_history(self, uri):
        """Save URI to history and limit the number of entries."""
        if uri in self.uri_history:
            self.uri_history.remove(uri)
        self.uri_history.insert(0, uri)
        if len(self.uri_history) > 10: # Keep last 10 entries
            self.uri_history = self.uri_history[:10]
        try:
            with open(self.uri_history_file, 'wb') as f:
                pickle.dump(self.uri_history, f)
        except Exception as e:
            print(f"Error saving URI history: {e}")

    def build_uri_with_auth(self, base_uri, has_auth, auth_source):
        """Build complete URI with authSource if needed."""
        if has_auth and auth_source.strip():
            # Check if URI already has query parameters
            if '?' in base_uri:
                return f"{base_uri}&authSource={auth_source.strip()}"
            else:
                return f"{base_uri}?authSource={auth_source.strip()}"
        return base_uri

    def on_uri_changed(self, event=None):
        """Handle URI changes and update authSource field visibility."""
        # Update dropdown values when URI changes
        self.uri_history_dropdown.configure(values=["Recent URIs..."] + self.uri_history)

    def toggle_auth_source(self):
        """Toggle the visibility of the authSource entry field."""
        if self.has_auth_var.get():
            self.auth_source_entry.configure(state="normal")
            self.auth_source_entry.focus()
        else:
            self.auth_source_entry.configure(state="disabled")
            self.auth_source_entry.delete(0, 'end')

    def on_uri_history_select(self, event):
        """Handle selection from the URI history dropdown."""
        selected_uri = self.uri_history_var.get()
        if selected_uri == "Recent URIs...":
            return
        self.uri_entry.delete(0, 'end')
        self.uri_entry.insert(0, selected_uri)
        # Reset auth checkbox and hide auth source
        self.has_auth_var.set(False)
        self.toggle_auth_source()
        # Update dropdown values
        self.uri_history_dropdown.configure(values=["Recent URIs..."] + self.uri_history)

    def on_profile_select(self, event):
        name = self.profiles_var.get()
        if name == "Profiles…" or name not in self.profiles:
            return
        profile = self.profiles[name]
        # Apply profile to connection bar
        self.uri_entry.delete(0, 'end')
        self.uri_entry.insert(0, profile.get('uri', ''))
        has_auth = profile.get('has_auth', False)
        self.has_auth_var.set(has_auth)
        self.toggle_auth_source()
        if has_auth:
            self.auth_source_entry.delete(0, 'end')
            self.auth_source_entry.insert(0, profile.get('authSource', 'admin'))
        # Optionally set default DB/Collection
        # Update dropdown profiles (in case new ones added)
        self.profiles_dropdown.configure(values=["Profiles…"] + list(self.profiles.keys()))

    def save_current_profile(self):
        name = simpledialog.askstring("Save Profile", "Enter profile name:")
        if not name:
            return
        profile = {
            'uri': self.uri_entry.get(),
            'has_auth': self.has_auth_var.get(),
            'authSource': self.auth_source_entry.get() if self.has_auth_var.get() else ''
        }
        self.profiles[name] = profile
        self._save_pickle(self.profiles_file, self.profiles)
        self.profiles_dropdown.configure(values=["Profiles…"] + list(self.profiles.keys()))

    def toggle_sync_auth_source(self, source_type):
        """Toggle the visibility of the authSource entry field for sync."""
        if source_type == "source":
            if self.sync_source_auth_var.get():
                self.sync_source_auth_source_full.configure(state="normal")
                self.sync_source_auth_source_full.focus()
            else:
                self.sync_source_auth_source_full.configure(state="disabled")
                self.sync_source_auth_source_full.delete(0, 'end')
        elif source_type == "dest":
            if self.sync_dest_auth_var.get():
                self.sync_dest_auth_source_full.configure(state="normal")
                self.sync_dest_auth_source_full.focus()
            else:
                self.sync_dest_auth_source_full.configure(state="disabled")
                self.sync_dest_auth_source_full.delete(0, 'end')

    def toggle_export_auth_source(self):
        """Toggle the visibility of the authSource entry field for export."""
        if self.export_auth_var.get():
            self.export_auth_source_full.configure(state="normal")
            self.export_auth_source_full.focus()
        else:
            self.export_auth_source_full.configure(state="disabled")
            self.export_auth_source_full.delete(0, 'end')

    def toggle_import_auth_source(self):
        """Toggle the visibility of the authSource entry field for import."""
        if self.import_auth_var.get():
            self.import_auth_source_full.configure(state="normal")
            self.import_auth_source_full.focus()
        else:
            self.import_auth_source_full.configure(state="disabled")
            self.import_auth_source_full.delete(0, 'end')

if __name__ == "__main__":
    app = App()
    app.mainloop()