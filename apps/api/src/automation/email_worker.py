#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Email Priority Classifier Service
Processes pending emails and tickets using NLP sentiment analysis
"""

import sys
import io
import os
import pymongo
from datetime import datetime
import schedule
import time
from textblob import TextBlob
import redis
import logging
from typing import Dict, Any
import traceback

# -----------------------------
# 0. Windows Unicode Fix
# -----------------------------
if sys.platform == "win32":
    try:
        # Force UTF-8 encoding for Windows console
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
        os.environ['PYTHONIOENCODING'] = 'utf-8'
        print("🔧 Windows encoding fixed successfully")
    except Exception as e:
        print(f"⚠️ Warning: Could not fix Windows encoding: {e}")

# -----------------------------
# 1. Logging Setup - Safe for Windows
# -----------------------------
def setup_logging():
    """Setup logging with proper Unicode handling"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('logs/email_worker.log', encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ],
        force=True
    )
    
    logger = logging.getLogger(__name__)
    
    # Test logging
    logger.info("=== EMAIL PRIORITY CLASSIFIER STARTED ===")
    return logger

logger = setup_logging()

# -----------------------------
# 2. Database Setup
# -----------------------------
try:
    mongo_client = pymongo.MongoClient("mongodb://localhost:27017/peppermint")
    db = mongo_client["peppermint"]
    tickets_col = db["tickets"]
    emails_col = db["emailmessages"]
    email_queue_col = db["emailqueues"]
    logger.info("Connected to MongoDB")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    sys.exit(1)

redis_client = None
try:
    redis_client = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    redis_client.ping()
    logger.info("Connected to Redis")
except Exception as e:
    logger.warning(f"Failed to connect to Redis: {e} (continuing without caching)")
    redis_client = None

# -----------------------------
# 3. Priority Detection
# -----------------------------
def detect_priority(subject: str, body: str = "") -> str:
    """
    Detect priority using keywords and sentiment analysis
    Returns: 'critical', 'high', 'medium', or 'low'
    """
    text = f"{subject} {body}".lower().strip()
    
    if not text:
        return 'low'
    
    # Critical keywords (highest priority)
    critical_keywords = [
        'urgent', 'critical', 'emergency', 'down', 'failure', 'broken', 
        'crash', 'outage', 'immediate', 'catastrophic', 'production down',
        'system down', 'server down', 'database down', 'major outage'
    ]
    if any(keyword in text for keyword in critical_keywords):
        logger.debug(f"CRITICAL priority detected by keywords: {subject[:50]}...")
        return 'critical'
    
    # High priority keywords
    high_keywords = [
        'severe', 'major', 'stop working', 'cannot access', 'security breach',
        'data loss', 'performance issue', 'high priority', 'escalate'
    ]
    if any(keyword in text for keyword in high_keywords):
        logger.debug("HIGH priority detected by keywords")
        return 'high'
    
    # Medium priority technical keywords
    medium_keywords = [
        'error', 'bug', 'issue', 'problem', 'slow', 'not working', 
        'login', 'password', 'access denied', 'timeout', 'warning'
    ]
    if any(keyword in text for keyword in medium_keywords):
        logger.debug("MEDIUM priority detected by technical keywords")
        return 'medium'
    
    # Sentiment analysis using TextBlob
    try:
        blob = TextBlob(text)
        polarity = blob.sentiment.polarity
        subjectivity = blob.sentiment.subjectivity
        
        logger.debug(f"Sentiment analysis - Polarity: {polarity:.3f}, Subjectivity: {subjectivity:.3f}")
        
        # Critical: extremely negative sentiment
        if polarity < -0.4:
            logger.debug("CRITICAL priority detected by sentiment analysis")
            return 'critical'
        
        # High: very negative sentiment or high subjectivity (angry complaints)
        elif polarity < -0.2 or (polarity < -0.1 and subjectivity > 0.8):
            logger.debug("HIGH priority detected by sentiment analysis")
            return 'high'
        
        # Medium: negative sentiment
        elif polarity < -0.05:
            logger.debug("MEDIUM priority detected by sentiment analysis")
            return 'medium'
        
        # Low: neutral or positive
        else:
            logger.debug("LOW priority detected by sentiment analysis")
            return 'low'
            
    except Exception as e:
        logger.warning(f"Sentiment analysis failed: {e}, defaulting to low")
        return 'low'

def get_context(doc: Dict[str, Any], doc_type: str = "email") -> Dict[str, Any]:
    """Extract context for logging"""
    if doc_type == "email":
        return {
            'id': str(doc.get('_id', '')),
            'subject': doc.get('subject', '')[:50],
            'from': doc.get('from', 'Unknown'),
            'priority_before': doc.get('priority', 'unknown'),
            'folder': doc.get('folder', 'unknown')
        }
    else:  # ticket
        return {
            'id': str(doc.get('_id', '')),
            'number': doc.get('number', 'Unknown'),
            'title': doc.get('title', '')[:50],
            'email': doc.get('email', 'Unknown'),
            'priority_before': doc.get('priority', 'unknown')
        }

# -----------------------------
# 4. Update Email Priority
# -----------------------------
def update_email_priority(email_doc: Dict[str, Any]) -> bool:
    """Update priority for a single email and its linked ticket"""
    try:
        email_id = email_doc['_id']
        subject = email_doc.get("subject", "")
        body = email_doc.get("body", "")
        from_email = email_doc.get("from", "")
        
        # Skip if already analyzed
        if email_doc.get('sentiment_analyzed', False):
            logger.debug(f"Skipping already analyzed email: {subject[:50]}...")
            return True
        
        # Detect new priority
        new_priority = detect_priority(subject, body)
        context = get_context(email_doc, "email")
        
        logger.info(f"Analyzing EMAIL {context['id'][:8]}: {context['subject']}...")
        logger.info(f"Priority: {context['priority_before']} -> {new_priority} | From: {context['from']}")
        
        # Cache result in Redis (optional)
        if redis_client:
            try:
                cache_key = f"priority_email:{str(email_id)}"
                redis_client.setex(cache_key, 3600, new_priority)
            except Exception as cache_err:
                logger.debug(f"Redis caching skipped: {cache_err}")
        
        # Update EmailMessage
        email_update_result = emails_col.update_one(
            {"_id": email_id},
            {"$set": {
                "priority": new_priority,
                "priority_updated_at": datetime.utcnow(),
                "sentiment_analyzed": True
            }}
        )
        
        if email_update_result.matched_count == 0:
            logger.warning(f"Email not found for update: {email_id}")
            return False
        
        updated_ticket_count = 0
        
        # Update linked ticket if emailId exists in ticket
        if email_doc.get('ticketId'):
            ticket_update_result = tickets_col.update_one(
                {"_id": email_doc['ticketId']},
                {"$set": {
                    "priority": new_priority,
                    "priority_updated_at": datetime.utcnow(),
                    "sentiment_analyzed": True
                }}
            )
            if ticket_update_result.modified_count > 0:
                updated_ticket_count += 1
                logger.info(f"Updated linked ticket via ticketId: {new_priority}")
        
        # Fallback: Update tickets by email address (for existing data)
        if from_email:
            ticket_fallback_result = tickets_col.update_many(
                {
                    "email": from_email.lower(),
                    "title": { "$regex": subject[:50], "$options": "i" },
                    "priority": "pending"
                },
                {"$set": {
                    "priority": new_priority,
                    "priority_updated_at": datetime.utcnow(),
                    "sentiment_analyzed": True
                }}
            )
            if ticket_fallback_result.modified_count > 0:
                updated_ticket_count += ticket_fallback_result.modified_count
                logger.info(f"Updated {ticket_fallback_result.modified_count} tickets via email match")
        
        logger.info(f"Email updated: {new_priority} | Tickets updated: {updated_ticket_count}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update email {email_doc.get('_id')}: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

# -----------------------------
# 5. Update Ticket Priority
# -----------------------------
def update_ticket_priority(ticket_doc: Dict[str, Any]) -> bool:
    """Update priority for a single ticket"""
    try:
        ticket_id = ticket_doc['_id']
        subject = ticket_doc.get("title", "")
        body = ticket_doc.get("detail", "")
        
        # Skip if already analyzed
        if ticket_doc.get('sentiment_analyzed', False):
            logger.debug(f"Skipping already analyzed ticket: {ticket_doc.get('number', 'Unknown')}")
            return True
        
        # Detect new priority
        new_priority = detect_priority(subject, body)
        context = get_context(ticket_doc, "ticket")
        
        logger.info(f"Analyzing TICKET {context['number']}: {context['title']}...")
        logger.info(f"Ticket priority: {context['priority_before']} -> {new_priority}")
        
        # Cache result in Redis (optional)
        if redis_client:
            try:
                cache_key = f"priority_ticket:{str(ticket_id)}"
                redis_client.setex(cache_key, 3600, new_priority)
            except Exception as cache_err:
                logger.debug(f"Redis caching skipped: {cache_err}")
        
        # Update Ticket
        ticket_update_result = tickets_col.update_one(
            {"_id": ticket_id},
            {"$set": {
                "priority": new_priority,
                "priority_updated_at": datetime.utcnow(),
                "sentiment_analyzed": True
            }}
        )
        
        if ticket_update_result.matched_count == 0:
            logger.warning(f"Ticket not found for update: {ticket_id}")
            return False
        
        # Update linked email if exists
        updated_email_count = 0
        if ticket_doc.get('emailId'):
            email_update_result = emails_col.update_one(
                {"_id": ticket_doc['emailId']},
                {"$set": {
                    "priority": new_priority,
                    "priority_updated_at": datetime.utcnow(),
                    "sentiment_analyzed": True
                }}
            )
            if email_update_result.modified_count > 0:
                updated_email_count += 1
                logger.info(f"Updated linked email via emailId: {new_priority}")
        
        logger.info(f"Ticket updated: {new_priority} | Linked email updated: {updated_email_count}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to update ticket {ticket_doc.get('_id')}: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

# -----------------------------
# 6. Process Pending Items
# -----------------------------
def process_pending_emails():
    """Process all pending emails"""
    try:
        # Find pending emails (no folder filter)
        pending_emails = list(emails_col.find(
            {
                "priority": "pending", 
                "sentiment_analyzed": {"$ne": True}
            },
            projection={"subject": 1, "body": 1, "from": 1, "priority": 1, "sentiment_analyzed": 1, "ticketId": 1},
            limit=10  # Process 10 at a time
        ).sort("createdAt", 1))
        
        if not pending_emails:
            logger.debug("No pending emails found")
            return
        
        logger.info(f"[EMAILS] Processing {len(pending_emails)} pending emails...")
        
        success_count = 0
        failed_count = 0
        
        for email_doc in pending_emails:
            try:
                if update_email_priority(email_doc):
                    success_count += 1
                else:
                    failed_count += 1
            except Exception as doc_error:
                logger.error(f"Error processing email {email_doc.get('_id')}: {doc_error}")
                failed_count += 1
        
        logger.info(f"[EMAILS] Batch complete: {success_count} successful, {failed_count} failed")
        
    except Exception as e:
        logger.error(f"Error in process_pending_emails: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")

def process_pending_tickets():
    """Process all pending tickets"""
    try:
        # Find pending tickets
        pending_tickets = list(tickets_col.find(
            {
                "priority": "pending", 
                "sentiment_analyzed": {"$ne": True}
            },
            projection={"title": 1, "detail": 1, "email": 1, "priority": 1, "sentiment_analyzed": 1, "emailId": 1},
            limit=10  # Process 10 at a time
        ).sort("createdAt", 1))
        
        if not pending_tickets:
            logger.debug("No pending tickets found")
            return
        
        logger.info(f"[TICKETS] Processing {len(pending_tickets)} pending tickets...")
        
        success_count = 0
        failed_count = 0
        
        for ticket_doc in pending_tickets:
            try:
                if update_ticket_priority(ticket_doc):
                    success_count += 1
                else:
                    failed_count += 1
            except Exception as doc_error:
                logger.error(f"Error processing ticket {ticket_doc.get('number', ticket_doc.get('_id'))}: {doc_error}")
                failed_count += 1
        
        logger.info(f"[TICKETS] Batch complete: {success_count} successful, {failed_count} failed")
        
    except Exception as e:
        logger.error(f"Error in process_pending_tickets: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")

def process_all_pending():
    """Process both emails and tickets"""
    start_time = time.time()
    
    process_pending_emails()
    time.sleep(0.5)  # Brief pause between batches
    process_pending_tickets()
    
    elapsed = time.time() - start_time
    logger.debug(f"Full processing cycle completed in {elapsed:.2f}s")

# -----------------------------
# 7. Health Check & Monitoring
# -----------------------------
def health_check():
    """Health check with detailed status"""
    try:
        # Email stats
        email_pending = emails_col.count_documents({
            "priority": "pending", 
            "sentiment_analyzed": {"$ne": True}
        })
        email_total = emails_col.count_documents({})
        email_critical = emails_col.count_documents({"priority": "critical"})
        email_high = emails_col.count_documents({"priority": "high"})
        email_medium = emails_col.count_documents({"priority": "medium"})
        email_low = emails_col.count_documents({"priority": "low"})
        
        # Ticket stats
        ticket_pending = tickets_col.count_documents({
            "priority": "pending", 
            "sentiment_analyzed": {"$ne": True}
        })
        ticket_total = tickets_col.count_documents({})
        ticket_critical = tickets_col.count_documents({"priority": "critical"})
        ticket_high = tickets_col.count_documents({"priority": "high"})
        ticket_medium = tickets_col.count_documents({"priority": "medium"})
        ticket_low = tickets_col.count_documents({"priority": "low"})
        
        logger.info(f"Health: E:{email_pending}/{email_total} T:{ticket_pending}/{ticket_total} | "
                   f"Priorities E:{email_critical}H:{email_high}M:{email_medium}L:{email_low} | "
                   f"T:{ticket_critical}H:{ticket_high}M:{ticket_medium}L:{ticket_low}")
        
        return email_pending + ticket_pending
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return -1

def print_stats():
    """Print detailed statistics"""
    try:
        # Email priority distribution
        email_stats = emails_col.aggregate([
            {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]).next()
        
        # Ticket priority distribution
        ticket_stats = tickets_col.aggregate([
            {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]).next()
        
        logger.info(f"STATS - Emails: {dict(email_stats)} | Tickets: {dict(ticket_stats)}")
        
    except Exception as e:
        logger.error(f"Stats collection failed: {e}")

# -----------------------------
# 8. Main Scheduler
# -----------------------------
def run_scheduler():
    """Main scheduler loop"""
    logger.info("🚀 Starting Python NLP Priority Classifier Service...")
    logger.info("📊 Monitoring emails and tickets for pending priority analysis...")
    logger.info("🔍 Using schema: priority, sentiment_analyzed, priority_updated_at")
    logger.info("⏰ Processing every 5 seconds | Health checks every 30 seconds")
    
    # Schedule jobs
    schedule.every(5).seconds.do(process_all_pending)
    schedule.every(30).seconds.do(health_check)
    schedule.every(60).seconds.do(print_stats)
    
    # Initial run
    logger.info("🔄 Running initial processing cycle...")
    process_all_pending()
    
    try:
        logger.info("✅ Service started successfully - press Ctrl+C to stop")
        logger.info("📈 Watch for processing logs and health checks...")
        
        while True:
            schedule.run_pending()
            time.sleep(1)
            
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal - stopping gracefully...")
    except Exception as e:
        logger.error(f"❌ Unexpected scheduler error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
    finally:
        if mongo_client:
            mongo_client.close()
        logger.info("👋 Service shutdown complete")

# -----------------------------
# 9. Entry Point
# -----------------------------
if __name__ == "__main__":
    try:
        # Validate dependencies
        logger.info("🔍 Checking dependencies...")
        logger.info(f"TextBlob version: {TextBlob}")
        logger.info(f"PyMongo version: {pymongo.version}")
        
        # Start the service
        run_scheduler()
        
    except ImportError as e:
        logger.error(f"❌ Missing required package: {e}")
        logger.error("💡 Install with: pip install pymongo textblob redis schedule")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Service startup failed: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        sys.exit(1)