<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NumericRecord extends Model
{
    protected $connection = 'pgsql';

    protected $fillable = ['id', 'workspace_id', 'label', 'value', 'enabled'];

    protected function casts(): array
    {
        return ['value' => 'integer', 'enabled' => 'boolean'];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
