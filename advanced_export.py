# Advanced Export Module for MongoDB Sync Tool Pro
import json
import csv
import pandas as pd
from pathlib import Path
import datetime
from typing import List, Dict, Any, Callable, Optional
from bson import ObjectId
import xlsxwriter
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

class AdvancedExporter:
    def __init__(self, client, db_name, collection_name):
        self.client = client
        self.db_name = db_name
        self.collection_name = collection_name
        self.collection = client[db_name][collection_name]
    
    def export_to_excel(self, file_path: str, query: Dict = None, limit: int = None, mask: Optional[Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]] = None):
        """Export collection data to Excel format"""
        try:
            # Get data
            cursor = self.collection.find(query or {})
            if limit:
                cursor = cursor.limit(limit)
            
            documents = list(cursor)
            if mask:
                documents = mask(documents)
            if not documents:
                raise ValueError("No documents found to export")
            
            # Convert to DataFrame
            df = pd.json_normalize(documents)
            
            # Handle ObjectId conversion
            for col in df.columns:
                if df[col].dtype == 'object':
                    df[col] = df[col].astype(str)
            
            # Create Excel file with formatting
            with pd.ExcelWriter(file_path, engine='xlsxwriter') as writer:
                df.to_excel(writer, sheet_name='Data', index=False)
                
                # Get workbook and worksheet
                workbook = writer.book
                worksheet = writer.sheets['Data']
                
                # Add formatting
                header_format = workbook.add_format({
                    'bold': True,
                    'text_wrap': True,
                    'valign': 'top',
                    'fg_color': '#D7E4BC',
                    'border': 1
                })
                
                # Apply header formatting
                for col_num, value in enumerate(df.columns.values):
                    worksheet.write(0, col_num, value, header_format)
                
                # Auto-adjust column widths
                for i, col in enumerate(df.columns):
                    max_len = max(
                        df[col].astype(str).map(len).max(),
                        len(str(col))
                    ) + 2
                    worksheet.set_column(i, i, min(max_len, 50))
                
                # Add metadata sheet
                metadata_df = pd.DataFrame({
                    'Property': ['Database', 'Collection', 'Export Date', 'Total Documents', 'Query Used'],
                    'Value': [
                        self.db_name,
                        self.collection_name,
                        datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        len(documents),
                        json.dumps(query or {}, default=str)
                    ]
                })
                metadata_df.to_excel(writer, sheet_name='Metadata', index=False)
            
            return f"Successfully exported {len(documents)} documents to Excel"
            
        except Exception as e:
            raise Exception(f"Excel export failed: {str(e)}")
    
    def export_to_csv(self, file_path: str, query: Dict = None, limit: int = None, fields: Optional[List[str]] = None, mask: Optional[Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]] = None):
        """Export collection data to CSV format"""
        try:
            cursor = self.collection.find(query or {})
            if limit:
                cursor = cursor.limit(limit)
            
            documents = list(cursor)
            if not documents:
                raise ValueError("No documents found to export")
            
            # Flatten documents and convert ObjectIds
            flattened_docs = []
            for doc in documents:
                flat_doc = self._flatten_dict(doc)
                # Convert ObjectId to string
                for key, value in flat_doc.items():
                    if isinstance(value, ObjectId):
                        flat_doc[key] = str(value)
                flattened_docs.append(flat_doc)
            
            # Get all unique keys
            all_keys = set()
            for doc in flattened_docs:
                all_keys.update(doc.keys())

            # Determine header fields
            if fields:
                # keep only requested fields, maintain given order
                header_fields = [f for f in fields if f in all_keys]
                if not header_fields:
                    header_fields = sorted(all_keys)
            else:
                header_fields = sorted(all_keys)
            
            # Write to CSV
            with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=header_fields)
                writer.writeheader()
                for row in flattened_docs:
                    # ensure missing keys present as empty
                    out = {k: row.get(k, "") for k in header_fields}
                    writer.writerow(out)
            
            return f"Successfully exported {len(documents)} documents to CSV"
            
        except Exception as e:
            raise Exception(f"CSV export failed: {str(e)}")
    
    def export_to_pdf_report(self, file_path: str, query: Dict = None, limit: int = 100, mask: Optional[Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]] = None):
        """Export collection data as a formatted PDF report"""
        try:
            cursor = self.collection.find(query or {})
            if limit:
                cursor = cursor.limit(limit)
            
            documents = list(cursor)
            if not documents:
                raise ValueError("No documents found to export")
            
            # Create PDF
            doc = SimpleDocTemplate(file_path, pagesize=A4)
            styles = getSampleStyleSheet()
            story = []
            
            # Title
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                spaceAfter=30,
                textColor=colors.darkblue
            )
            story.append(Paragraph(f"MongoDB Collection Report", title_style))
            story.append(Spacer(1, 12))
            
            # Metadata
            metadata_style = ParagraphStyle(
                'Metadata',
                parent=styles['Normal'],
                fontSize=12,
                spaceAfter=6
            )
            
            story.append(Paragraph(f"<b>Database:</b> {self.db_name}", metadata_style))
            story.append(Paragraph(f"<b>Collection:</b> {self.collection_name}", metadata_style))
            story.append(Paragraph(f"<b>Export Date:</b> {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", metadata_style))
            story.append(Paragraph(f"<b>Total Documents:</b> {len(documents)}", metadata_style))
            story.append(Paragraph(f"<b>Query:</b> {json.dumps(query or {}, default=str)}", metadata_style))
            story.append(Spacer(1, 20))
            
            # Collection Statistics
            story.append(Paragraph("Collection Statistics", styles['Heading2']))
            
            # Get field statistics
            field_stats = self._get_field_statistics(documents)
            stats_data = [['Field Name', 'Type', 'Frequency', 'Sample Value']]
            
            for field, stats in field_stats.items():
                sample_value = str(stats['sample'])[:50] + "..." if len(str(stats['sample'])) > 50 else str(stats['sample'])
                stats_data.append([
                    field,
                    stats['type'],
                    f"{stats['count']}/{len(documents)}",
                    sample_value
                ])
            
            stats_table = Table(stats_data)
            stats_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(stats_table)
            story.append(Spacer(1, 20))
            
            # Sample Documents
            story.append(Paragraph("Sample Documents", styles['Heading2']))
            
            for i, doc in enumerate(documents[:5]):  # Show first 5 documents
                story.append(Paragraph(f"Document {i+1}:", styles['Heading3']))
                doc_text = json.dumps(doc, indent=2, default=str, ensure_ascii=False)
                
                # Truncate if too long
                if len(doc_text) > 1000:
                    doc_text = doc_text[:1000] + "\n... (truncated)"
                
                code_style = ParagraphStyle(
                    'Code',
                    parent=styles['Normal'],
                    fontName='Courier',
                    fontSize=8,
                    leftIndent=20,
                    spaceAfter=12
                )
                
                story.append(Paragraph(f"<pre>{doc_text}</pre>", code_style))
                story.append(Spacer(1, 12))
            
            # Build PDF
            doc.build(story)
            
            return f"Successfully exported PDF report with {len(documents)} documents"
            
        except Exception as e:
            raise Exception(f"PDF export failed: {str(e)}")
    
    def export_to_json(self, file_path: str, query: Dict = None, limit: int = None, pretty: bool = True, mask: Optional[Callable[[List[Dict[str, Any]]], List[Dict[str, Any]]]] = None):
        """Export collection data to JSON format"""
        try:
            cursor = self.collection.find(query or {})
            if limit:
                cursor = cursor.limit(limit)
            
            documents = list(cursor)
            if not documents:
                raise ValueError("No documents found to export")
            
            # Convert ObjectIds to strings
            json_docs = []
            for doc in documents:
                json_doc = self._convert_objectids(doc)
                json_docs.append(json_doc)
            
            # Write to JSON file
            with open(file_path, 'w', encoding='utf-8') as f:
                if pretty:
                    json.dump(json_docs, f, indent=2, ensure_ascii=False, default=str)
                else:
                    json.dump(json_docs, f, ensure_ascii=False, default=str)
            
            return f"Successfully exported {len(documents)} documents to JSON"
            
        except Exception as e:
            raise Exception(f"JSON export failed: {str(e)}")
    
    def _flatten_dict(self, d, parent_key='', sep='_'):
        """Flatten nested dictionary"""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep=sep).items())
            elif isinstance(v, list):
                items.append((new_key, json.dumps(v, default=str)))
            else:
                items.append((new_key, v))
        return dict(items)
    
    def _convert_objectids(self, obj):
        """Convert ObjectIds to strings recursively"""
        if isinstance(obj, ObjectId):
            return str(obj)
        elif isinstance(obj, dict):
            return {k: self._convert_objectids(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_objectids(item) for item in obj]
        else:
            return obj
    
    def _get_field_statistics(self, documents):
        """Get statistics about fields in the collection"""
        field_stats = {}
        
        for doc in documents:
            for field, value in doc.items():
                if field not in field_stats:
                    field_stats[field] = {
                        'count': 0,
                        'type': type(value).__name__,
                        'sample': value
                    }
                field_stats[field]['count'] += 1
        
        return field_stats

# Integration function for the main app
def create_export_dialog(parent, client, db_name, collection_name):
    """Create export dialog for the main application"""
    import customtkinter as ctk
    from tkinter import filedialog, messagebox
    
    dialog = ctk.CTkToplevel(parent)
    dialog.title("🚀 Advanced Export Options")
    dialog.geometry("600x500")
    dialog.transient(parent)
    dialog.grab_set()
    
    # Configure grid
    dialog.grid_columnconfigure(0, weight=1)
    dialog.grid_rowconfigure(2, weight=1)
    
    # Header
    header_frame = ctk.CTkFrame(dialog)
    header_frame.grid(row=0, column=0, sticky="ew", padx=20, pady=20)
    
    ctk.CTkLabel(header_frame, text="📊 Advanced Data Export", 
                font=ctk.CTkFont(size=18, weight="bold")).pack(pady=10)
    
    ctk.CTkLabel(header_frame, text=f"Database: {db_name} | Collection: {collection_name}", 
                font=ctk.CTkFont(size=12)).pack()
    
    # Export options
    options_frame = ctk.CTkFrame(dialog)
    options_frame.grid(row=1, column=0, sticky="ew", padx=20, pady=(0,10))
    options_frame.grid_columnconfigure(1, weight=1)
    
    # Format selection
    ctk.CTkLabel(options_frame, text="Export Format:").grid(row=0, column=0, padx=10, pady=10, sticky="w")
    format_var = ctk.StringVar(value="Excel (.xlsx)")
    format_menu = ctk.CTkOptionMenu(options_frame, 
                                   values=["Excel (.xlsx)", "CSV (.csv)", "JSON (.json)", "PDF Report (.pdf)"],
                                   variable=format_var)
    format_menu.grid(row=0, column=1, padx=10, pady=10, sticky="ew")
    
    # Limit selection
    ctk.CTkLabel(options_frame, text="Document Limit:").grid(row=1, column=0, padx=10, pady=10, sticky="w")
    limit_var = ctk.StringVar(value="1000")
    limit_entry = ctk.CTkEntry(options_frame, textvariable=limit_var)
    limit_entry.grid(row=1, column=1, padx=10, pady=10, sticky="ew")
    
    # Query filter
    ctk.CTkLabel(options_frame, text="Filter Query (JSON):").grid(row=2, column=0, padx=10, pady=10, sticky="nw")
    query_text = ctk.CTkTextbox(options_frame, height=100)
    query_text.grid(row=2, column=1, padx=10, pady=10, sticky="ew")
    query_text.insert("1.0", "{}")
    
    # Buttons
    button_frame = ctk.CTkFrame(dialog)
    button_frame.grid(row=3, column=0, sticky="ew", padx=20, pady=(0,20))
    button_frame.grid_columnconfigure((0,1), weight=1)
    
    def export_data():
        try:
            # Get parameters
            format_choice = format_var.get()
            limit = int(limit_var.get()) if limit_var.get().strip() and limit_var.get().strip() != "0" else None
            query_str = query_text.get("1.0", "end-1c").strip()
            
            # Parse query
            query = json.loads(query_str) if query_str and query_str != "{}" else None
            
            # Get file extension
            ext_map = {
                "Excel (.xlsx)": ".xlsx",
                "CSV (.csv)": ".csv", 
                "JSON (.json)": ".json",
                "PDF Report (.pdf)": ".pdf"
            }
            
            extension = ext_map[format_choice]
            
            # Choose save location
            file_path = filedialog.asksaveasfilename(
                defaultextension=extension,
                filetypes=[(format_choice, f"*{extension}")],
                title="Save Export As"
            )
            
            if not file_path:
                return
            
            # Create exporter and export
            exporter = AdvancedExporter(client, db_name, collection_name)
            
            if format_choice == "Excel (.xlsx)":
                result = exporter.export_to_excel(file_path, query, limit)
            elif format_choice == "CSV (.csv)":
                result = exporter.export_to_csv(file_path, query, limit)
            elif format_choice == "JSON (.json)":
                result = exporter.export_to_json(file_path, query, limit)
            elif format_choice == "PDF Report (.pdf)":
                result = exporter.export_to_pdf_report(file_path, query, limit)
            
            messagebox.showinfo("Export Complete", result)
            dialog.destroy()
            
        except json.JSONDecodeError:
            messagebox.showerror("Error", "Invalid JSON in query filter")
        except ValueError as e:
            messagebox.showerror("Error", str(e))
        except Exception as e:
            messagebox.showerror("Error", f"Export failed: {str(e)}")
    
    ctk.CTkButton(button_frame, text="📤 Export", command=export_data).grid(row=0, column=0, padx=10, pady=10, sticky="ew")
    ctk.CTkButton(button_frame, text="❌ Cancel", command=dialog.destroy).grid(row=0, column=1, padx=10, pady=10, sticky="ew")
    
    return dialog
