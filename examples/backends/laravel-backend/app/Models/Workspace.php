<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workspace extends Model
{
    protected $connection = 'pgsql';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name', 'slug'];

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function counters(): HasMany
    {
        return $this->hasMany(Counter::class);
    }

    public function numericRecords(): HasMany
    {
        return $this->hasMany(NumericRecord::class);
    }

    public function uuidRecords(): HasMany
    {
        return $this->hasMany(UuidRecord::class);
    }
}
