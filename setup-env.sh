#!/bin/bash

# Quick Reference: Environment Setup for Aura v1.3.0

# Create necessary directories
mkdir -p logs

# Enable logging (development)
export LOG_LEVEL=debug
export LOGGING_ENABLED=true
export MONITORING_ENABLED=true

# Database configuration
export DB_PATH=./db.json
export CACHE_ENABLED=true
export CACHE_TTL=300000  # 5 minutes
export ASYNC_IO_ENABLED=true

# Performance monitoring
export MONITORING_ENABLED=true
export SLOW_API_THRESHOLD=500      # ms
export SLOW_QUERY_THRESHOLD=100    # ms

# Rate limiting
export RATE_LIMIT_ENABLED=true

# Security
export SANITIZATION_ENABLED=true
export HELMET_ENABLED=true

# Features (enable/disable as needed)
export FEATURE_ADVANCED_ANALYSIS=true
export FEATURE_TREND_ANALYSIS=true
export FEATURE_PERSONALIZED_RECS=true
export FEATURE_SLEEP_TRACKING=true
export FEATURE_ANXIETY_ANALYSIS=true

# Create .env file from this script:
# bash setup-env.sh > .env

echo "Environment variables configured successfully."
echo "Add these to your .env file for v1.3.0 optimization."
