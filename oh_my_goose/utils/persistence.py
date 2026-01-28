"""Persistence layer with Ralph-style loop for oh-my-goose."""

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time


class PersistenceHandler(FileSystemEventHandler):
    """Handler for file system events."""
    
    def __init__(self, callback: callable):
        """Initialize the handler with a callback function.
        
        Args:
            callback: Function to call when a file is modified.
        """
        self.callback = callback
    
    def on_modified(self, event):
        """Called when a file is modified.
        
        Args:
            event: The file system event.
        """
        if not event.is_directory:
            self.callback(event.src_path)


def ralph_loop(dir_to_watch: str, callback: callable):
    """Watch directory for changes and call callback on file modify. Runs infinite loop.
    
    Args:
        dir_to_watch: Directory path to monitor.
        callback: Function to call on file modifications.
    """
    handler = PersistenceHandler(callback)
    observer = Observer()
    observer.schedule(handler, dir_to_watch, recursive=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    
    observer.join()
