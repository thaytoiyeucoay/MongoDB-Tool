# Advanced Data Visualization Module for MongoDB Sync Tool Pro
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import seaborn as sns
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from bson import ObjectId
from collections import Counter, defaultdict
import customtkinter as ctk
from typing import Dict, List, Any, Optional

# Set style for better looking plots
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")

class DataVisualizer:
    def __init__(self, client, theme_manager=None):
        self.client = client
        self.theme_manager = theme_manager
        self.setup_matplotlib_theme()
    
    def setup_matplotlib_theme(self):
        """Configure matplotlib to match the app theme"""
        if self.theme_manager and self.theme_manager.current_theme == "dark":
            plt.style.use('dark_background')
            self.bg_color = '#1a1d23'
            self.text_color = '#e2e8f0'
        else:
            plt.style.use('default')
            self.bg_color = '#ffffff'
            self.text_color = '#000000'
    
    def create_collection_size_chart(self, db_name: str, parent_frame):
        """Create a pie chart showing collection sizes"""
        try:
            db = self.client[db_name]
            collections = db.list_collection_names()
            
            if not collections:
                return self._create_no_data_chart(parent_frame, "No collections found")
            
            # Get collection stats
            collection_stats = []
            for coll_name in collections:
                try:
                    stats = db.command("collStats", coll_name)
                    size = stats.get('size', 0)
                    count = stats.get('count', 0)
                    collection_stats.append({
                        'name': coll_name,
                        'size': size,
                        'count': count
                    })
                except:
                    collection_stats.append({
                        'name': coll_name,
                        'size': 0,
                        'count': 0
                    })
            
            # Create figure
            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
            fig.patch.set_facecolor(self.bg_color)
            
            # Size pie chart
            sizes = [stat['size'] for stat in collection_stats]
            labels = [stat['name'] for stat in collection_stats]
            
            if sum(sizes) > 0:
                ax1.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
                ax1.set_title('Collection Sizes (Bytes)', color=self.text_color, fontsize=14, fontweight='bold')
            else:
                ax1.text(0.5, 0.5, 'No size data available', ha='center', va='center', 
                        transform=ax1.transAxes, color=self.text_color)
                ax1.set_title('Collection Sizes', color=self.text_color)
            
            # Document count bar chart
            counts = [stat['count'] for stat in collection_stats]
            bars = ax2.bar(range(len(labels)), counts, color=sns.color_palette("husl", len(labels)))
            ax2.set_xlabel('Collections', color=self.text_color)
            ax2.set_ylabel('Document Count', color=self.text_color)
            ax2.set_title('Document Counts by Collection', color=self.text_color, fontsize=14, fontweight='bold')
            ax2.set_xticks(range(len(labels)))
            ax2.set_xticklabels(labels, rotation=45, ha='right', color=self.text_color)
            ax2.tick_params(colors=self.text_color)
            
            # Add value labels on bars
            for i, bar in enumerate(bars):
                height = bar.get_height()
                ax2.text(bar.get_x() + bar.get_width()/2., height + max(counts)*0.01,
                        f'{int(height)}', ha='center', va='bottom', color=self.text_color)
            
            plt.tight_layout()
            return self._embed_chart(fig, parent_frame)
            
        except Exception as e:
            return self._create_error_chart(parent_frame, f"Error creating collection chart: {str(e)}")
    
    def create_field_distribution_chart(self, db_name: str, collection_name: str, parent_frame, sample_size: int = 1000):
        """Create charts showing field distribution and data types"""
        try:
            collection = self.client[db_name][collection_name]
            
            # Sample documents
            pipeline = [{"$sample": {"size": sample_size}}]
            documents = list(collection.aggregate(pipeline))
            
            if not documents:
                return self._create_no_data_chart(parent_frame, "No documents found")
            
            # Analyze field distribution
            field_stats = self._analyze_field_distribution(documents)
            
            # Create figure with subplots
            fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 12))
            fig.patch.set_facecolor(self.bg_color)
            
            # 1. Field frequency chart
            field_names = list(field_stats.keys())[:10]  # Top 10 fields
            field_counts = [field_stats[field]['count'] for field in field_names]
            
            bars1 = ax1.barh(field_names, field_counts, color=sns.color_palette("viridis", len(field_names)))
            ax1.set_xlabel('Frequency', color=self.text_color)
            ax1.set_title('Top 10 Most Common Fields', color=self.text_color, fontweight='bold')
            ax1.tick_params(colors=self.text_color)
            
            # 2. Data type distribution
            type_counter = Counter()
            for field_data in field_stats.values():
                type_counter.update(field_data['types'])
            
            types = list(type_counter.keys())
            type_counts = list(type_counter.values())
            
            ax2.pie(type_counts, labels=types, autopct='%1.1f%%', startangle=90)
            ax2.set_title('Data Type Distribution', color=self.text_color, fontweight='bold')
            
            # 3. Document size distribution
            doc_sizes = [len(json.dumps(doc, default=str)) for doc in documents]
            ax3.hist(doc_sizes, bins=20, alpha=0.7, color='skyblue', edgecolor='black')
            ax3.set_xlabel('Document Size (bytes)', color=self.text_color)
            ax3.set_ylabel('Frequency', color=self.text_color)
            ax3.set_title('Document Size Distribution', color=self.text_color, fontweight='bold')
            ax3.tick_params(colors=self.text_color)
            
            # 4. Field completeness heatmap
            completeness_data = []
            field_names_subset = field_names[:15]  # Top 15 fields for heatmap
            
            for doc in documents[:50]:  # Sample of documents
                row = []
                for field in field_names_subset:
                    row.append(1 if field in doc else 0)
                completeness_data.append(row)
            
            if completeness_data:
                sns.heatmap(np.array(completeness_data).T, 
                           yticklabels=field_names_subset,
                           xticklabels=[f'Doc {i+1}' for i in range(len(completeness_data))],
                           cmap='RdYlGn', ax=ax4, cbar_kws={'label': 'Field Present'})
                ax4.set_title('Field Completeness Heatmap', color=self.text_color, fontweight='bold')
                ax4.set_xlabel('Documents (Sample)', color=self.text_color)
                ax4.set_ylabel('Fields', color=self.text_color)
            
            plt.tight_layout()
            return self._embed_chart(fig, parent_frame)
            
        except Exception as e:
            return self._create_error_chart(parent_frame, f"Error creating field distribution: {str(e)}")
    
    def create_time_series_chart(self, db_name: str, collection_name: str, parent_frame, 
                                date_field: str = "_id", sample_size: int = 1000):
        """Create time series visualization"""
        try:
            collection = self.client[db_name][collection_name]
            
            # Try to find documents with date fields
            if date_field == "_id":
                # Use ObjectId timestamp
                pipeline = [
                    {"$sample": {"size": sample_size}},
                    {"$project": {"timestamp": {"$toDate": "$_id"}}},
                    {"$sort": {"timestamp": 1}}
                ]
            else:
                pipeline = [
                    {"$match": {date_field: {"$exists": True}}},
                    {"$sample": {"size": sample_size}},
                    {"$sort": {date_field: 1}}
                ]
            
            documents = list(collection.aggregate(pipeline))
            
            if not documents:
                return self._create_no_data_chart(parent_frame, "No time series data found")
            
            # Extract timestamps
            timestamps = []
            for doc in documents:
                if date_field == "_id":
                    timestamps.append(doc.get('timestamp'))
                else:
                    date_val = doc.get(date_field)
                    if isinstance(date_val, datetime):
                        timestamps.append(date_val)
                    elif isinstance(date_val, str):
                        try:
                            timestamps.append(datetime.fromisoformat(date_val.replace('Z', '+00:00')))
                        except:
                            continue
            
            if not timestamps:
                return self._create_no_data_chart(parent_frame, "No valid timestamps found")
            
            # Create time series plots
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
            fig.patch.set_facecolor(self.bg_color)
            
            # 1. Document creation timeline
            df = pd.DataFrame({'timestamp': timestamps})
            df['date'] = df['timestamp'].dt.date
            daily_counts = df.groupby('date').size()
            
            ax1.plot(daily_counts.index, daily_counts.values, marker='o', linewidth=2, markersize=4)
            ax1.set_xlabel('Date', color=self.text_color)
            ax1.set_ylabel('Documents Created', color=self.text_color)
            ax1.set_title('Document Creation Timeline', color=self.text_color, fontweight='bold')
            ax1.tick_params(colors=self.text_color)
            ax1.grid(True, alpha=0.3)
            
            # Format x-axis dates
            ax1.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
            ax1.xaxis.set_major_locator(mdates.DayLocator(interval=max(1, len(daily_counts)//10)))
            plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)
            
            # 2. Hourly distribution
            df['hour'] = df['timestamp'].dt.hour
            hourly_counts = df.groupby('hour').size()
            
            bars2 = ax2.bar(hourly_counts.index, hourly_counts.values, 
                           color=sns.color_palette("viridis", 24), alpha=0.8)
            ax2.set_xlabel('Hour of Day', color=self.text_color)
            ax2.set_ylabel('Document Count', color=self.text_color)
            ax2.set_title('Document Creation by Hour', color=self.text_color, fontweight='bold')
            ax2.set_xticks(range(0, 24, 2))
            ax2.tick_params(colors=self.text_color)
            ax2.grid(True, alpha=0.3)
            
            plt.tight_layout()
            return self._embed_chart(fig, parent_frame)
            
        except Exception as e:
            return self._create_error_chart(parent_frame, f"Error creating time series: {str(e)}")
    
    def create_query_performance_chart(self, db_name: str, collection_name: str, parent_frame):
        """Create query performance analysis charts"""
        try:
            collection = self.client[db_name][collection_name]
            
            # Test different query patterns
            query_tests = [
                {"name": "Find All", "query": {}, "limit": 100},
                {"name": "Simple Filter", "query": {"_id": {"$exists": True}}, "limit": 100},
                {"name": "Range Query", "query": {"_id": {"$gte": ObjectId("000000000000000000000000")}}, "limit": 100},
                {"name": "Text Search", "query": {"$text": {"$search": "test"}}, "limit": 100} if self._has_text_index(collection) else None,
            ]
            
            # Filter out None queries
            query_tests = [q for q in query_tests if q is not None]
            
            # Run performance tests
            performance_data = []
            for test in query_tests:
                try:
                    start_time = datetime.now()
                    list(collection.find(test["query"]).limit(test["limit"]))
                    end_time = datetime.now()
                    duration = (end_time - start_time).total_seconds() * 1000  # Convert to ms
                    performance_data.append({"name": test["name"], "duration": duration})
                except:
                    performance_data.append({"name": test["name"], "duration": 0})
            
            if not performance_data:
                return self._create_no_data_chart(parent_frame, "No performance data available")
            
            # Create performance chart
            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
            fig.patch.set_facecolor(self.bg_color)
            
            # 1. Query performance bar chart
            names = [item["name"] for item in performance_data]
            durations = [item["duration"] for item in performance_data]
            
            bars1 = ax1.bar(names, durations, color=sns.color_palette("rocket", len(names)))
            ax1.set_xlabel('Query Type', color=self.text_color)
            ax1.set_ylabel('Duration (ms)', color=self.text_color)
            ax1.set_title('Query Performance Comparison', color=self.text_color, fontweight='bold')
            ax1.tick_params(colors=self.text_color)
            plt.setp(ax1.xaxis.get_majorticklabels(), rotation=45)
            
            # Add value labels on bars
            for bar, duration in zip(bars1, durations):
                height = bar.get_height()
                ax1.text(bar.get_x() + bar.get_width()/2., height + max(durations)*0.01,
                        f'{duration:.1f}ms', ha='center', va='bottom', color=self.text_color)
            
            # 2. Index analysis
            indexes = list(collection.list_indexes())
            index_names = [idx.get('name', 'Unknown') for idx in indexes]
            index_sizes = []
            
            for idx in indexes:
                try:
                    # Estimate index size (simplified)
                    key_count = len(idx.get('key', {}))
                    index_sizes.append(key_count * 100)  # Simplified estimation
                except:
                    index_sizes.append(100)
            
            if index_names:
                bars2 = ax2.bar(index_names, index_sizes, color=sns.color_palette("mako", len(index_names)))
                ax2.set_xlabel('Index Name', color=self.text_color)
                ax2.set_ylabel('Estimated Size', color=self.text_color)
                ax2.set_title('Index Overview', color=self.text_color, fontweight='bold')
                ax2.tick_params(colors=self.text_color)
                plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45)
            
            plt.tight_layout()
            return self._embed_chart(fig, parent_frame)
            
        except Exception as e:
            return self._create_error_chart(parent_frame, f"Error creating performance chart: {str(e)}")
    
    def _analyze_field_distribution(self, documents: List[Dict]) -> Dict:
        """Analyze field distribution in documents"""
        field_stats = defaultdict(lambda: {
            'count': 0,
            'types': Counter(),
            'sample_values': []
        })
        
        for doc in documents:
            self._analyze_document_fields(doc, field_stats)
        
        return dict(field_stats)
    
    def _analyze_document_fields(self, doc: Dict, field_stats: Dict, prefix: str = ""):
        """Recursively analyze document fields"""
        for key, value in doc.items():
            field_name = f"{prefix}.{key}" if prefix else key
            field_stats[field_name]['count'] += 1
            field_stats[field_name]['types'][type(value).__name__] += 1
            
            if len(field_stats[field_name]['sample_values']) < 5:
                field_stats[field_name]['sample_values'].append(str(value)[:100])
            
            # Recursively analyze nested documents
            if isinstance(value, dict) and len(str(value)) < 1000:  # Avoid deep nesting
                self._analyze_document_fields(value, field_stats, field_name)
    
    def _has_text_index(self, collection) -> bool:
        """Check if collection has text index"""
        try:
            indexes = list(collection.list_indexes())
            for idx in indexes:
                if any('text' in str(v) for v in idx.get('key', {}).values()):
                    return True
            return False
        except:
            return False
    
    def _embed_chart(self, fig, parent_frame):
        """Embed matplotlib figure in tkinter frame"""
        canvas = FigureCanvasTkAgg(fig, parent_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)
        return canvas
    
    def _create_no_data_chart(self, parent_frame, message: str):
        """Create a chart showing no data message"""
        fig, ax = plt.subplots(figsize=(8, 6))
        fig.patch.set_facecolor(self.bg_color)
        ax.text(0.5, 0.5, message, ha='center', va='center', 
                transform=ax.transAxes, fontsize=16, color=self.text_color)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
        return self._embed_chart(fig, parent_frame)
    
    def _create_error_chart(self, parent_frame, error_message: str):
        """Create a chart showing error message"""
        fig, ax = plt.subplots(figsize=(8, 6))
        fig.patch.set_facecolor(self.bg_color)
        ax.text(0.5, 0.5, f"Error: {error_message}", ha='center', va='center',
                transform=ax.transAxes, fontsize=12, color='red', wrap=True)
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
        return self._embed_chart(fig, parent_frame)

class VisualizationManager:
    """Manager class for handling visualization UI in the main app"""
    
    def __init__(self, parent_frame, client, theme_manager=None):
        self.parent_frame = parent_frame
        self.client = client
        self.theme_manager = theme_manager
        self.visualizer = DataVisualizer(client, theme_manager)
        self.current_canvas = None
        self.setup_ui()
    
    def setup_ui(self):
        """Setup the visualization UI"""
        # Control panel
        self.control_frame = ctk.CTkFrame(self.parent_frame)
        self.control_frame.pack(fill="x", padx=10, pady=5)
        
        # Database selection
        ctk.CTkLabel(self.control_frame, text="📊 Data Visualization", 
                    font=ctk.CTkFont(size=16, weight="bold")).pack(side="left", padx=10)
        
        # Chart type selection
        self.chart_type_var = ctk.StringVar(value="Collection Overview")
        self.chart_type_menu = ctk.CTkOptionMenu(
            self.control_frame,
            values=["Collection Overview", "Field Distribution", "Time Series", "Query Performance"],
            variable=self.chart_type_var,
            command=self.on_chart_type_change
        )
        self.chart_type_menu.pack(side="right", padx=10, pady=5)
        
        ctk.CTkLabel(self.control_frame, text="Chart Type:").pack(side="right", padx=(10,5))
        
        # Database and collection selection
        self.db_var = ctk.StringVar()
        self.collection_var = ctk.StringVar()
        
        self.db_menu = ctk.CTkOptionMenu(self.control_frame, values=["Select Database"], 
                                        variable=self.db_var, command=self.on_db_change)
        self.db_menu.pack(side="right", padx=5, pady=5)
        
        self.collection_menu = ctk.CTkOptionMenu(self.control_frame, values=["Select Collection"],
                                               variable=self.collection_var, command=self.on_collection_change)
        self.collection_menu.pack(side="right", padx=5, pady=5)
        
        # Chart display area
        self.chart_frame = ctk.CTkScrollableFrame(self.parent_frame)
        self.chart_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Refresh databases
        self.refresh_databases()
    
    def refresh_databases(self):
        """Refresh the database list"""
        try:
            if self.client:
                dbs = [db for db in self.client.list_database_names() 
                      if db not in ["admin", "config", "local"]]
                self.db_menu.configure(values=dbs if dbs else ["No databases"])
                if dbs:
                    self.db_var.set(dbs[0])
                    self.on_db_change(dbs[0])
        except Exception as e:
            print(f"Error refreshing databases: {e}")
    
    def on_db_change(self, db_name):
        """Handle database selection change"""
        try:
            if self.client and db_name != "No databases":
                collections = self.client[db_name].list_collection_names()
                self.collection_menu.configure(values=collections if collections else ["No collections"])
                if collections:
                    self.collection_var.set(collections[0])
                    self.update_chart()
        except Exception as e:
            print(f"Error changing database: {e}")
    
    def on_collection_change(self, collection_name):
        """Handle collection selection change"""
        self.update_chart()
    
    def on_chart_type_change(self, chart_type):
        """Handle chart type change"""
        self.update_chart()
    
    def update_chart(self):
        """Update the displayed chart"""
        try:
            # Clear previous chart
            if self.current_canvas:
                self.current_canvas.get_tk_widget().destroy()
            
            # Clear chart frame
            for widget in self.chart_frame.winfo_children():
                widget.destroy()
            
            db_name = self.db_var.get()
            collection_name = self.collection_var.get()
            chart_type = self.chart_type_var.get()
            
            if not db_name or db_name == "No databases" or not self.client:
                return
            
            # Create appropriate chart
            if chart_type == "Collection Overview":
                self.current_canvas = self.visualizer.create_collection_size_chart(db_name, self.chart_frame)
            elif chart_type == "Field Distribution" and collection_name and collection_name != "No collections":
                self.current_canvas = self.visualizer.create_field_distribution_chart(
                    db_name, collection_name, self.chart_frame)
            elif chart_type == "Time Series" and collection_name and collection_name != "No collections":
                self.current_canvas = self.visualizer.create_time_series_chart(
                    db_name, collection_name, self.chart_frame)
            elif chart_type == "Query Performance" and collection_name and collection_name != "No collections":
                self.current_canvas = self.visualizer.create_query_performance_chart(
                    db_name, collection_name, self.chart_frame)
            
        except Exception as e:
            print(f"Error updating chart: {e}")
            # Show error in chart frame
            error_label = ctk.CTkLabel(self.chart_frame, text=f"Error: {str(e)}", 
                                     text_color="red")
            error_label.pack(pady=20)
